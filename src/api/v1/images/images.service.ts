import * as Exp from 'express';
import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Config from '@/lib/config';
import * as AppError from '@/lib/app-error';
import { Image } from '@/../prisma/client';
import db from '@/lib/db';
import sharp from 'sharp';

const include = Utils.fieldsToIncludeWithImage;
const notFoundErrMsg = 'image not found';

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

export const getValidImageFileFormReq = async (
  req: Exp.Request & { file?: Express.Multer.File }
): Promise<Types.ImageFile> => {
  if (req.file) {
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(req.file.buffer).metadata();
    } catch {
      throw new AppError.AppBaseError(
        'Invalid image file',
        400,
        'InvalidImageError'
      );
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
          throw new AppError.AppBaseError(
            message,
            400,
            'UnsupportedImageTypeError'
          );
        }
      }
    })();
    return { ...req.file, mimetype, format, width, height, ext };
  }
  throw new AppError.AppBaseError(
    'image is required',
    400,
    'FileNotExistError'
  );
};

export const uploadImage = async (
  imageFile: Types.ImageFile,
  user: Types.PublicUser,
  imageData?: Image
) => {
  let bucket = Config.SUPABASE_BUCKET,
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
    filePath = `${Config.STORAGE_ROOT_DIR}/${user.username}/${uniqueFileName}`;
  }
  const { data, error } = await Config.supabase.storage
    .from(bucket)
    .upload(filePath, imageFile.buffer, {
      contentType: imageFile.mimetype,
      upsert,
    });
  if (error) throw new AppError.AppBaseError(error.message, 500, error.name);
  return data;
};

export const getImageMetadata = ({
  mimetype,
  width,
  height,
  size,
}: Types.ImageFile): Types.ImageMetadata => {
  return { mimetype, width, height, size };
};

export const saveImage = async (
  uploadImageRes: Awaited<ReturnType<typeof uploadImage>>,
  data: Types.FullImageData,
  user: Types.PublicUser
): Promise<Types.PublicImage> => {
  const src = `${Config.SUPABASE_BUCKET_URL}/${uploadImageRes.path}`;
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

export const removeUploadedImage = async (imageData: Image) => {
  const [bucketName, ...splittedPath] = imageData.storageFullPath.split('/');
  const filePath = splittedPath.join('/');
  const bucket = bucketName;
  const { data, error } = await Config.supabase.storage
    .from(bucket)
    .remove([filePath]);
  if (error) throw new AppError.AppBaseError(error.message, 500, error.name);
  return data;
};

export const deleteImageById = async (id: string) => {
  const dbQuery = db.image.delete({ where: { id } });
  return await Utils.handleDBKnownErrors(dbQuery, { notFoundErrMsg });
};

export const getImageOwnerAndInjectImageInResLocals = async (
  req: Exp.Request,
  res: Exp.Response
) => {
  const dbQuery = db.image.findUnique({
    where: { id: req.params.id },
    omit: { storageFullPath: false, storageId: false },
  });
  const image = await Utils.handleDBKnownErrors(dbQuery, { notFoundErrMsg });
  if (!image) throw new AppError.AppNotFoundError(notFoundErrMsg);
  res.locals.image = image;
  return image.ownerId;
};
