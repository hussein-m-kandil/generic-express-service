import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Image from '@/lib/image';
import * as AppError from '@/lib/app-error';
import db from '@/lib/db';

const notFoundErrMsg = Image.NOT_FOUND_ERR_MSG;
const include = Image.FIELDS_TO_INCLUDE;

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

export const saveImage: (
  ...args: Parameters<typeof Image.getImageUpsertData>
) => Promise<Types.PublicImage> = async (...args) => {
  const imageData = Image.getImageUpsertData(...args);
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
  data: Types.ImageDataInput,
  id: string
): Promise<Types.PublicImage> => {
  const dbQuery = db.image.update({ where: { id }, data, include });
  const savedImage = await Utils.handleDBKnownErrors(dbQuery, {
    uniqueFieldName: 'src',
  });
  return savedImage;
};

export const deleteImageById = async (id: string) => {
  const dbQuery = db.image.delete({ where: { id } });
  return await Utils.handleDBKnownErrors(dbQuery, { notFoundErrMsg });
};
