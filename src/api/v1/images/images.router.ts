import {
  saveImage,
  uploadImage,
  getAllImages,
  findImageById,
  getValidImageFileFormReq,
} from './images.service';
import {
  authValidator,
  createOwnerValidator,
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
  createOwnerValidator(async (req, res) => {
    const image = await findImageById(req.params.id, { rowImage: true });
    res.locals.image = image;
    return image.ownerId;
  }),
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

export default imagesRouter;
