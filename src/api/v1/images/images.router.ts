import {
  saveImage,
  uploadImage,
  getAllImages,
  findImageById,
  getValidImageFileFormReq,
} from './images.service';
import { createFileProcessor } from '../../../middlewares/file-processor';
import { authValidator } from '../../../middlewares/validators';
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

export default imagesRouter;
