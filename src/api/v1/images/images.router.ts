import {
  saveImage,
  uploadImage,
  getAllImages,
  findImageById,
  deleteImageById,
  removeUploadedImage,
  getValidImageFileFormReq,
  getImageOwnerAndInjectImageInResLocals,
} from './images.service';
import {
  authValidator,
  createOwnerValidator,
  createAdminOrOwnerValidator,
} from '../../../middlewares/validators';
import { createFileProcessor } from '../../../middlewares/file-processor';
import { Image } from '../../../../prisma/generated/client';
import { Request, Response, Router } from 'express';
import { PublicUser } from '../../../types';

export const imagesRouter = Router();

imagesRouter.get('/', async (req, res) => {
  res.json(await getAllImages());
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
    const imageFile = getValidImageFileFormReq(req);
    const uploadRes = await uploadImage(imageFile, user);
    const savedImage = await saveImage(uploadRes, user);
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
    const imageFile = getValidImageFileFormReq(req);
    const uploadRes = await uploadImage(imageFile, user, image);
    const savedImage = await saveImage(uploadRes, user);
    res.json(savedImage);
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
