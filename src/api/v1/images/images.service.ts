import {
  supabase,
  SUPABASE_BUCKET,
  STORAGE_ROOT_DIR,
  SUPABASE_BUCKET_URL,
} from '../../../lib/config';
import {
  getPaginationArgs,
  handleDBKnownErrors,
  fieldsToIncludeWithImage,
} from '../../../lib/helpers';
import {
  ImageFile,
  PublicUser,
  PublicImage,
  ImageMetadata,
  FullImageData,
  ImageDataInput,
  PaginationFilters,
} from '../../../types';
import { AppError, AppNotFoundError } from '../../../lib/app-error';
import { Image } from '../../../../prisma/generated/client';
import { Request, Response } from 'express';
import db from '../../../lib/db';
import sharp from 'sharp';

const include = fieldsToIncludeWithImage;
const notFoundErrMsg = 'image not found';

export const getAllImages = async (
  filters?: PaginationFilters
): Promise<PublicImage[]> => {
  const dbQuery = db.image.findMany({
    include,
    ...(filters ? getPaginationArgs(filters) : {}),
  });
  return await handleDBKnownErrors(dbQuery);
};

export const findImageById = async (id: string): Promise<PublicImage> => {
  const dbQuery = db.image.findUnique({ where: { id }, include });
  const image = await handleDBKnownErrors(dbQuery, { notFoundErrMsg });
  if (!image) throw new AppNotFoundError(notFoundErrMsg);
  return image;
};

export const getValidImageFileFormReq = async (
  req: Request & { file?: Express.Multer.File }
): Promise<ImageFile> => {
  if (req.file) {
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(req.file.buffer).metadata();
    } catch {
      throw new AppError('Invalid image file', 400, 'InvalidImageError');
    }
    const { format, width, height } = metadata;
    const mimetype = `image/${format}`;
    const ext = (() => {
      switch (mimetype) {
        case 'image/png':
          return '.png';
        case 'image/jpeg':
          return '.jpg';
        case 'image/webp':
          return '.webp';
        default: {
          const message = 'Unsupported image type (expect png, jpg, or webp)';
          throw new AppError(message, 400, 'UnsupportedImageTypeError');
        }
      }
    })();
    return { ...req.file, mimetype, format, width, height, ext };
  }
  throw new AppError('image is required', 400, 'FileNotExistError');
};

export const uploadImage = async (
  imageFile: ImageFile,
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

export const getImageMetadata = ({
  mimetype,
  width,
  height,
  size,
}: ImageFile): ImageMetadata => {
  return { mimetype, width, height, size };
};

export const saveImage = async (
  uploadImageRes: Awaited<ReturnType<typeof uploadImage>>,
  data: FullImageData,
  user: PublicUser
): Promise<PublicImage> => {
  const src = `${SUPABASE_BUCKET_URL}/${uploadImageRes.path}`;
  const imageData = {
    ...data,
    src,
    ownerId: user.id,
    storageId: uploadImageRes.id,
    storageFullPath: uploadImageRes.fullPath,
  };
  const dbQuery = db.image.upsert({
    create: imageData,
    update: imageData,
    where: { src },
    include,
  });
  const savedImage = await handleDBKnownErrors(dbQuery, {
    uniqueFieldName: 'src',
  });
  return savedImage;
};

export const updateImageData = async (
  data: ImageDataInput,
  id: string
): Promise<PublicImage> => {
  const dbQuery = db.image.update({ where: { id }, data, include });
  const savedImage = await handleDBKnownErrors(dbQuery, {
    uniqueFieldName: 'src',
  });
  return savedImage;
};

export const removeUploadedImage = async (imageData: Image) => {
  const [bucketName, ...splittedPath] = imageData.storageFullPath.split('/');
  const filePath = splittedPath.join('/');
  const bucket = bucketName;
  const { data, error } = await supabase.storage
    .from(bucket)
    .remove([filePath]);
  if (error) throw new AppError(error.message, 500, error.name);
  return data;
};

export const deleteImageById = async (id: string) => {
  const dbQuery = db.image.delete({ where: { id } });
  return await handleDBKnownErrors(dbQuery, { notFoundErrMsg });
};

export const getImageOwnerAndInjectImageInResLocals = async (
  req: Request,
  res: Response
) => {
  const dbQuery = db.image.findUnique({
    where: { id: req.params.id },
    omit: { storageFullPath: false, storageId: false },
  });
  const image = await handleDBKnownErrors(dbQuery, { notFoundErrMsg });
  if (!image) throw new AppNotFoundError(notFoundErrMsg);
  res.locals.image = image;
  return image.ownerId;
};

export default {
  getImageOwnerAndInjectImageInResLocals,
  getValidImageFileFormReq,
  removeUploadedImage,
  getImageMetadata,
  deleteImageById,
  updateImageData,
  findImageById,
  getAllImages,
  uploadImage,
  saveImage,
};
