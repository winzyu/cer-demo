import { Request, Response, NextFunction } from "express";
import createError from "http-errors";

export const notFound = (req: Request, _res: Response, next: NextFunction): void => {
  next(createError.NotFound(`Not Found - ${req.originalUrl}`));
};
