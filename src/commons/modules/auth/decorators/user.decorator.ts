import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type User = { id: number; code: string };

export type TokenPayLoad = {
  user: User;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
