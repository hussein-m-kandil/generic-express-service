import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Image from '@/lib/image';
import * as Storage from '@/lib/storage';
import * as Schema from './image.schema';
import * as AppError from '@/lib/app-error';
import { Image as ImageT } from 'prisma/client';
import { z } from 'zod';
import db from '@/lib/db';

const notFoundErrMsg = Image.NOT_FOUND_ERR_MSG;
const include = Image.FIELDS_TO_INCLUDE;

export type _ImageDataInput = z.output<typeof Schema.imageSchema>;
export type _ImageFullData = _ImageDataInput & Types.ImageMetadata;

export const getAllImages = async (
  filters?: Types.PaginationFilters
): Promise<Types.PublicImage[]> => {
  const dbQuery = db.image.findMany({
    include,
    ...(filters ? Utils.getPaginationArgs(filters) : {}),
  });
  return await Utils.handleDBKnownErrors(dbQuery);
};

export const findImageById = async (id: string): Promise<Types.PublicImage> => {
  const dbQuery = db.image.findUnique({ where: { id }, include });
  const image = await Utils.handleDBKnownErrors(dbQuery, { notFoundErrMsg });
  if (!image) throw new AppError.AppNotFoundError(notFoundErrMsg);
  return image;
};

export const saveImage = async (
  uploadedImage: Storage.UploadedImageData,
  { isAvatar, ...data }: _ImageFullData,
  user: Types.PublicUser
): Promise<Types.PublicImage> => {
  const imageData = {
    ...Image.getImageUpsertData(uploadedImage, data, user),
    ...(isAvatar ? { user: { connect: { id: user.id } } } : {}),
  };
  const dbQuery = db.image.upsert({
    create: imageData,
    update: imageData,
    where: { src: imageData.src },
    include,
  });
  const savedImage = await Utils.handleDBKnownErrors(dbQuery, {
    uniqueFieldName: 'src',
  });
  return savedImage;
};

export const updateImageData = async (
  { isAvatar, ...data }: _ImageDataInput,
  { id }: ImageT,
  user: Types.PublicUser
): Promise<Types.PublicImage> => {
  const dbQuery = db.image.update({
    data: { ...data, userId: isAvatar ? user.id : null },
    where: { id },
    include,
  });
  const savedImage = await Utils.handleDBKnownErrors(dbQuery, {
    uniqueFieldName: 'src',
  });
  return savedImage;
};

export const deleteImageById = async (id: string) => {
  const dbQuery = db.image.delete({ where: { id } });
  return await Utils.handleDBKnownErrors(dbQuery, { notFoundErrMsg });
};
