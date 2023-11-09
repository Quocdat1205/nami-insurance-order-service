import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type TokenPayLoad = {
  id: number;
  code: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenPayLoad => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
