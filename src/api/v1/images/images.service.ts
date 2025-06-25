import {
  STORAGE_ROOT_DIR,
  supabase,
  SUPABASE_BUCKET,
  SUPABASE_BUCKET_URL,
} from '../../../lib/config';
import { handleDBKnownErrors } from '../../../lib/helpers';
import { AppError } from '../../../lib/app-error';
import { PublicUser } from '../../../types';
import { Request } from 'express';
import db from '../../../lib/db';
import path from 'path';

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
  file: ReturnType<typeof getValidImageFileFormReq>,
  user: PublicUser
) => {
  const randomSuffix = Math.round(Math.random() * Date.now()) % 10 ** 8;
  const uniqueFileName = `${user.id}-${randomSuffix}${file.ext}`;
  const filePath = `${STORAGE_ROOT_DIR}/${user.username}/${uniqueFileName}`;
  const { data, error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(filePath, file.buffer, { contentType: file.mimetype });
  if (error) {
    throw new AppError(error.message, 500, error.name);
  }
  return data;
};

export const saveImage = async (
  uploadImageRes: Awaited<ReturnType<typeof uploadImage>>,
  user: PublicUser
) => {
  const url = `${SUPABASE_BUCKET_URL}/${uploadImageRes.path}`;
  const dbQuery = db.image.create({
    data: {
      storageFullPath: uploadImageRes.fullPath,
      storageId: uploadImageRes.id,
      ownerId: user.id,
      url,
    },
    omit: { storageFullPath: true, storageId: true },
    include: { owner: true },
  });
  const savedImage = await handleDBKnownErrors(dbQuery, {
    uniqueFieldName: 'url',
  });
  return savedImage;
};

export default { getValidImageFileFormReq, uploadImage, saveImage };
