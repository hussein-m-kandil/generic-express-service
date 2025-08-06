import * as Exp from 'express';
import * as Types from '@/types';
import * as Utils from '@/lib/utils';
import * as Schema from './image.schema';
import * as Service from './images.service';
import * as Middlewares from '@/middlewares';
import { Image } from '@/../prisma/client';

export const imagesRouter = Exp.Router();

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
  async (req: Exp.Request, res: Exp.Response) => {
    const user = req.user as Types.PublicUser;
    const imageFile = await Service.getValidImageFileFormReq(req);
    const data = {
      ...Schema.imageSchema.parse(req.body),
      ...Service.getImageMetadata(imageFile),
    };
    const uploadRes = await Service.uploadImage(imageFile, user);
    const savedImage = await Service.saveImage(uploadRes, data, user);
    res.status(201).json(savedImage);
  }
);

imagesRouter.put(
  '/:id',
  Middlewares.authValidator,
  Middlewares.createOwnerValidator(
    Service.getImageOwnerAndInjectImageInResLocals
  ),
  Middlewares.createFileProcessor('image'),
  async (req: Exp.Request, res: Exp.Response<unknown, { image: Image }>) => {
    const { image } = res.locals;
    const user = req.user as Types.PublicUser;
    if (req.file) {
      const imageFile = await Service.getValidImageFileFormReq(req);
      const data = {
        ...Schema.imageSchema.parse(req.body),
        ...Service.getImageMetadata(imageFile),
      };
      const uploadRes = await Service.uploadImage(imageFile, user, image);
      const savedImage = await Service.saveImage(uploadRes, data, user);
      res.json(savedImage);
    } else {
      const data = Schema.imageSchema.parse(req.body);
      const updatedImage = await Service.updateImageData(data, req.params.id);
      res.json(updatedImage);
    }
  }
);

imagesRouter.delete(
  '/:id',
  Middlewares.authValidator,
  Middlewares.createAdminOrOwnerValidator(
    Service.getImageOwnerAndInjectImageInResLocals
  ),
  async (req, res: Exp.Response<unknown, { image: Image }>) => {
    const { image } = res.locals;
    await Service.removeUploadedImage(image);
    await Service.deleteImageById(image.id);
    res.status(204).send();
  }
);
