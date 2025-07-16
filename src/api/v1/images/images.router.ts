import {
  saveImage,
  uploadImage,
  getAllImages,
  findImageById,
  updateImageData,
  deleteImageById,
  removeUploadedImage,
  getValidImageFileFormReq,
  getImageOwnerAndInjectImageInResLocals,
  getImageMetadata,
} from './images.service';
import {
  authValidator,
  createOwnerValidator,
  createAdminOrOwnerValidator,
} from '../../../middlewares/validators';
import { createFileProcessor } from '../../../middlewares/file-processor';
import { getPaginationFiltersFromReq } from '../../../lib/helpers';
import { Image } from '../../../../prisma/generated/client';
import { Request, Response, Router } from 'express';
import { PublicUser } from '../../../types';
import { imageSchema } from './image.schema';

export const imagesRouter = Router();

imagesRouter.get('/', async (req, res) => {
  res.json(await getAllImages(getPaginationFiltersFromReq(req)));
});

imagesRouter.get('/:id', async (req, res) => {
  res.json(await findImageById(req.params.id));
});

imagesRouter.post(
  '/',
  authValidator,
  createFileProcessor('image'),
  async (req: Request, res: Response) => {
    const user = req.user as PublicUser;
    const imageFile = await getValidImageFileFormReq(req);
    const data = {
      ...imageSchema.parse(req.body),
      ...getImageMetadata(imageFile),
    };
    const uploadRes = await uploadImage(imageFile, user);
    const savedImage = await saveImage(uploadRes, data, user);
    res.status(201).json(savedImage);
  }
);

imagesRouter.put(
  '/:id',
  authValidator,
  createOwnerValidator(getImageOwnerAndInjectImageInResLocals),
  createFileProcessor('image'),
  async (req: Request, res: Response<unknown, { image: Image }>) => {
    const { image } = res.locals;
    const user = req.user as PublicUser;
    if (req.file) {
      const imageFile = await getValidImageFileFormReq(req);
      const data = {
        ...imageSchema.parse(req.body),
        ...getImageMetadata(imageFile),
      };
      const uploadRes = await uploadImage(imageFile, user, image);
      const savedImage = await saveImage(uploadRes, data, user);
      res.json(savedImage);
    } else {
      const data = imageSchema.parse(req.body);
      const updatedImage = await updateImageData(data, req.params.id);
      res.json(updatedImage);
    }
  }
);

imagesRouter.delete(
  '/:id',
  authValidator,
  createAdminOrOwnerValidator(getImageOwnerAndInjectImageInResLocals),
  async (req, res: Response<unknown, { image: Image }>) => {
    const { image } = res.locals;
    await removeUploadedImage(image);
    await deleteImageById(image.id);
    res.status(204).send();
  }
);

export default imagesRouter;
