import * as Types from '@/types';
import * as AppError from '@/lib/app-error';
import { createClient } from '@supabase/supabase-js';
import { Image } from '@/../prisma/client';

if (
  !process.env.STORAGE_URL ||
  !process.env.STORAGE_KEY ||
  !process.env.STORAGE_BUCKET ||
  !process.env.STORAGE_ROOT_DIR ||
  !process.env.STORAGE_BUCKET_URL
) {
  throw new Error(
    'StorageEnvVarMissed: STORAGE_URL, STORAGE_KEY, STORAGE_BUCKET, STORAGE_BUCKET_URL, or STORAGE_ROOT_DIR'
  );
}

export const STORAGE_URL = process.env.STORAGE_URL;
export const STORAGE_KEY = process.env.STORAGE_KEY;
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET;
export const STORAGE_ROOT_DIR = process.env.STORAGE_ROOT_DIR;
export const STORAGE_BUCKET_URL = process.env.STORAGE_BUCKET_URL;

export const supabase = createClient(STORAGE_URL, STORAGE_KEY);

export const uploadImage = async (
  imageFile: Types.ImageFile,
  user: Types.PublicUser,
  imageData?: Image | null
) => {
  let bucket = STORAGE_BUCKET,
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
  if (error) throw new AppError.AppBaseError(error.message, 500, error.name);
  return { ...data, publicUrl: `${STORAGE_BUCKET_URL}/${data.path}` };
};

export type UploadedImageData = Awaited<ReturnType<typeof uploadImage>>;

export const removeImage = async (imageData: Image) => {
  const [bucketName, ...splittedPath] = imageData.storageFullPath.split('/');
  const filePath = splittedPath.join('/');
  const bucket = bucketName;
  const { data, error } = await supabase.storage
    .from(bucket)
    .remove([filePath]);
  if (error) throw new AppError.AppBaseError(error.message, 500, error.name);
  return data;
};

export type RemovedImageData = Awaited<ReturnType<typeof removeImage>>;
