import {
  saveImage,
  uploadImage,
  getValidImageFileFormReq,
} from './images.service';
import { createFileProcessor } from '../../../middlewares/file-processor';
import { authValidator } from '../../../middlewares/validators';
import { Request, Response, Router } from 'express';
import { PublicUser } from '../../../types';
import { imageSchema } from './image.schema';

export const imagesRouter = Router();

imagesRouter.post(
  '/',
  authValidator,
  createFileProcessor('image'),
  async (req: Request, res: Response) => {
    const user = req.user as PublicUser;
    const imageFile = getValidImageFileFormReq(req);
    const data = {
      ...imageSchema.parse(req.body),
      mimetype: imageFile.mimetype,
      size: imageFile.size,
    };
    const uploadRes = await uploadImage(imageFile, user);
    const savedImage = await saveImage(uploadRes, data, user);
    res.status(201).json(savedImage);
  }
);

export default imagesRouter;
