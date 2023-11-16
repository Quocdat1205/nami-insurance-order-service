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
    const { authorization, fakeauthorization } = request.headers;
    if (!authorization && fakeauthorization && !config.IS_PRODUCTION) {
      context.switchToHttp().getRequest().user = {
        id: Number(fakeauthorization),
        code: 'fake',
      };
      return true;
    }

    console.log(config.JWT_SECRET);
    console.log(authorization?.replace('Bearer', '').trim());
    try {
      const payload = verify(
        authorization?.replace('Bearer', '').trim(),
        config.JWT_SECRET,
      ) as {
        payload: TokenPayLoad;
      };
      
      if (!payload?.payload?.user?.id || !payload?.payload?.user?.code)
        throw new UnauthorizedException();
      payload.payload.user.id = Number(payload?.payload.user?.id);
      context.switchToHttp().getRequest().user = payload.payload.user;
      return true;
    } catch (e) {
      throw new UnauthorizedException();
    }
  }
}
