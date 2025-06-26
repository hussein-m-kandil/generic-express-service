import {
  supabase,
  SUPABASE_BUCKET,
  STORAGE_ROOT_DIR,
  SUPABASE_BUCKET_URL,
} from '../../../lib/config';
import {
  PublicUser,
  PublicImage,
  OmitImageSensitiveData,
  AggregateImageData,
} from '../../../types';
import { AppError, AppNotFoundError } from '../../../lib/app-error';
import { Image } from '../../../../prisma/generated/client';
import { handleDBKnownErrors } from '../../../lib/helpers';
import { Request } from 'express';
import db from '../../../lib/db';
import path from 'path';

const omit: OmitImageSensitiveData = { storageFullPath: true, storageId: true };
const include: AggregateImageData = { owner: { omit: { password: true } } };

export const getAllImages = async (): Promise<PublicImage[]> => {
  const dbQuery = db.image.findMany({ include, omit });
  return await handleDBKnownErrors(dbQuery);
};

export const findImageById = async (
  id: string,
  options = { rowImage: false }
): Promise<Image | PublicImage> => {
  const notFoundErrMsg = 'image not found';
  const dbQuery: Promise<Image | PublicImage | null> = options.rowImage
    ? db.image.findUnique({ where: { id } })
    : db.image.findUnique({
        where: { id },
        include,
        omit,
      });
  const image = await handleDBKnownErrors(dbQuery, { notFoundErrMsg });
  if (!image) throw new AppNotFoundError(notFoundErrMsg);
  return image;
};

export const getValidImageFileFormReq = (
  req: Request & { file?: Express.Multer.File }
): Express.Multer.File & { ext: string } => {
  if (req.file) {
    const file = { ...req.file, ext: path.extname(req.file.originalname) };
    if (
      /^image\/(png|jpeg|webp)$/.test(file.mimetype) &&
      /^\.(png|jpe?g|webp)$/.test(file.ext)
    ) {
      return file;
    }
    throw new AppError('invalid image type', 400, 'InvalidImageError');
  }
  throw new AppError('image is required', 400, 'FileNotExistError');
};

export const uploadImage = async (
  imageFile: ReturnType<typeof getValidImageFileFormReq>,
  user: PublicUser,
  imageData?: Image
) => {
  let bucket = SUPABASE_BUCKET,
    upsert = false,
    filePath: string;
  if (imageData) {
    const [bucketName, ...splittedPath] = imageData.storageFullPath.split('/');
    filePath = splittedPath.join('/');
    bucket = bucketName;
    upsert = true;
  } else {
    const randomSuffix = Math.round(Math.random() * Date.now()) % 10 ** 8;
    const uniqueFileName = `${user.id}-${randomSuffix}${imageFile.ext}`;
    filePath = `${STORAGE_ROOT_DIR}/${user.username}/${uniqueFileName}`;
  }
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, imageFile.buffer, {
      contentType: imageFile.mimetype,
      upsert,
    });
  if (error) throw new AppError(error.message, 500, error.name);
  return data;
};

export const saveImage = async (
  uploadImageRes: Awaited<ReturnType<typeof uploadImage>>,
  user: PublicUser
): Promise<PublicImage> => {
  const url = `${SUPABASE_BUCKET_URL}/${uploadImageRes.path}`;
  const imageData = {
    storageFullPath: uploadImageRes.fullPath,
    storageId: uploadImageRes.id,
    ownerId: user.id,
    url,
  };
  const dbQuery = db.image.upsert({
    create: imageData,
    update: imageData,
    where: { url },
    include,
    omit,
  });
  const savedImage = await handleDBKnownErrors(dbQuery, {
    uniqueFieldName: 'url',
  });
  return savedImage;
};

export default {
  getValidImageFileFormReq,
  findImageById,
  getAllImages,
  uploadImage,
  saveImage,
};
