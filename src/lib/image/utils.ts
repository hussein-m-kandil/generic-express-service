import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Storage from '@/lib/storage';
import * as AppError from '@/lib/app-error';
import { Request, Response } from 'express';
import sharp from 'sharp';
import db from '@/lib/db';

export const NOT_FOUND_ERR_MSG = 'image not found';

export const FIELDS_TO_INCLUDE = Utils.fieldsToIncludeWithImage;

export const getValidImageFileFormReq = async (
  req: Request & { file?: Express.Multer.File }
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

export const getImageMetadata = ({
  mimetype,
  width,
  height,
  size,
}: Types.ImageFile): Types.ImageMetadata => {
  return { mimetype, width, height, size };
};

export const getImageOwnerAndInjectImageInResLocals = async (
  req: Request,
  res: Response
) => {
  const dbQuery = db.image.findUnique({
    where: { id: req.params.id },
    omit: { storageFullPath: false, storageId: false },
  });
  const image = await Utils.handleDBKnownErrors(dbQuery, {
    notFoundErrMsg: NOT_FOUND_ERR_MSG,
  });
  if (!image) throw new AppError.AppNotFoundError(NOT_FOUND_ERR_MSG);
  res.locals.image = image;
  return image.ownerId;
};

export const getImageUpsertData = (
  uploadImageRes: Storage.UploadedImageData,
  data: Types.ImageFullData,
  user: Types.PublicUser
) => {
  return {
    ...data,
    src: uploadImageRes.publicUrl,
    owner: { connect: { id: user.id } },
    storageFullPath: uploadImageRes.fullPath,
    storageId: uploadImageRes.id,
  };
};
