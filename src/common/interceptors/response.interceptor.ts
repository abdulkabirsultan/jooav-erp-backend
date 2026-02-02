import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BaseResponse, ResponseStatus } from '../dto/base-response.dto';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  BaseResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<BaseResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // Check if the response is already formatted with our custom SuccessResponse
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'message' in data &&
          'data' in data
        ) {
          // If it's already our custom format, convert it to BaseResponse
          // Use the meta from SuccessResponse if available
          return new BaseResponse(
            data.message,
            data.data,
            ResponseStatus.SUCCESS,
            data.meta,
          );
        }

        const message = this.getSuccessMessage(context);

        // Check if the data already has pagination structure (data + meta)
        if (
          data &&
          typeof data === 'object' &&
          'data' in data &&
          'meta' in data
        ) {
          // For paginated responses, use the updated constructor
          return new BaseResponse(
            message,
            data.data,
            ResponseStatus.SUCCESS,
            data.meta,
          );
        }

        // For non-paginated responses, use normal structure
        return new BaseResponse(message, data, ResponseStatus.SUCCESS);
      }),
    );
  }

  private getSuccessMessage(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    switch (method) {
      case 'POST':
        return 'Resource created successfully';
      case 'PUT':
      case 'PATCH':
        return 'Resource updated successfully';
      case 'DELETE':
        return 'Resource deleted successfully';
      case 'GET':
      default:
        return 'Operation completed successfully';
    }
  }
}
