import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request=context.switchToHttp().getRequest();
    if (request.path === '/health' || request.path === '/auth/login' || request.path.startsWith('/docs')) return true;
    const token=request.headers.authorization?.replace(/^Bearer /,'');
    if(!token) throw new UnauthorizedException('Autenticação necessária');
    try { request.user=jwt.verify(token,process.env.JWT_SECRET ?? 'change-me'); return true; } catch { throw new UnauthorizedException('Token inválido'); }
  }
}
