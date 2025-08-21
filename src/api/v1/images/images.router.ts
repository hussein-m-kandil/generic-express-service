import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Image from '@/lib/image';
import * as Storage from '@/lib/storage';
import * as Service from './images.service';
import * as Middlewares from '@/middlewares';
import { Router, Request, Response } from 'express';
import { Image as ImageT } from '@/../prisma/client';

export const imagesRouter = Router();

imagesRouter.get('/', async (req, res) => {
  res.json(
    await Service.getAllImages(Utils.getPaginationFiltersFromReqQuery(req))
  );
});

imagesRouter.get('/:id', async (req, res) => {
  res.json(await Service.findImageById(req.params.id));
});

imagesRouter.post(
  '/',
  Middlewares.authValidator,
  Middlewares.createFileProcessor('image'),
  async (req: Request, res: Response) => {
    const user = req.user as Types.PublicUser;
    const imageFile = await Image.getValidImageFileFormReq(req);
    const data = {
      ...Image.imageSchema.parse(req.body),
      ...Image.getImageMetadata(imageFile),
    };
    const uploadRes = await Storage.uploadImage(imageFile, user);
    const savedImage = await Service.saveImage(uploadRes, data, user);
    res.status(201).json(savedImage);
  }
);

imagesRouter.put(
  '/:id',
  Middlewares.authValidator,
  Middlewares.createOwnerValidator(
    Image.getImageOwnerAndInjectImageInResLocals
  ),
  Middlewares.createFileProcessor('image'),
  async (req: Request, res: Response<unknown, { image: ImageT }>) => {
    const { image } = res.locals;
    const user = req.user as Types.PublicUser;
    if (req.file) {
      const imageFile = await Image.getValidImageFileFormReq(req);
      const data = {
        ...Image.imageSchema.parse(req.body),
        ...Image.getImageMetadata(imageFile),
      };
      const uploadRes = await Storage.uploadImage(imageFile, user, image);
      const savedImage = await Service.saveImage(uploadRes, data, user);
      res.json(savedImage);
    } else {
      const data = Image.imageSchema.parse(req.body);
      const updatedImage = await Service.updateImageData(data, req.params.id);
      res.json(updatedImage);
    }
  }
);

imagesRouter.delete(
  '/:id',
  Middlewares.authValidator,
  Middlewares.createAdminOrOwnerValidator(
    Image.getImageOwnerAndInjectImageInResLocals
  ),
  async (req, res: Response<unknown, { image: ImageT }>) => {
    const { image } = res.locals;
    await Storage.removeImage(image);
    await Service.deleteImageById(image.id);
    res.status(204).send();
  }
);
