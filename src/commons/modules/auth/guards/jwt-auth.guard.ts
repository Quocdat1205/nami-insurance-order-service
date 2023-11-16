import { TokenPayLoad } from '@commons/modules/auth/decorators/user.decorator';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import config from '@configs/configuration';
import { Reflector } from '@nestjs/core';
import { verify } from 'jsonwebtoken';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const allowUnauthorizedRequest = this.reflector.get<boolean>(
      'allowUnauthorizedRequest',
      context.getHandler(),
    );
    if (allowUnauthorizedRequest) return allowUnauthorizedRequest;
    const { accesstoken, fakeauthorization } = request.headers;
    if (!accesstoken && fakeauthorization && !config.IS_PRODUCTION) {
      context.switchToHttp().getRequest().user = {
        id: Number(fakeauthorization),
        code: 'fake',
      };
      return true;
    }
    try {
      const payload = verify(
        accesstoken?.replace('Bearer', '').trim(),
        config.JWT_SECRET,
      ) as {
        user: TokenPayLoad;
      };
      if (!payload?.user?.id) throw new UnauthorizedException();
      payload.user.id = Number(payload?.user?.id);
      context.switchToHttp().getRequest().user = payload.user;
      return true;
    } catch (e) {
      throw new UnauthorizedException();
    }
  }
}
