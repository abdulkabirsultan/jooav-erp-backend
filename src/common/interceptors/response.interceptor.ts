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
        // A handler that supplied its own `success` and `message` has already
        // described the outcome; preserve that wording.
        //
        // `data` is intentionally NOT required here. Handlers that omit it
        // previously fell through to the generic per-method strings below,
        // which is why endpoints like admin login surfaced "Resource created
        // successfully". The response *shape* is unaffected either way: the
        // generic path passed the whole handler object through as
        // BaseResponse.data, so relaxing this guard changes only the message.
        const isHandlerFormatted =
          data !== null &&
          typeof data === 'object' &&
          'success' in data &&
          'message' in data;

        if (isHandlerFormatted) {
          const handler = data as Record<string, any>;

          // Only unwrap when the handler actually provided a payload.
          // `data: undefined` must not shadow sibling fields such as
          // paymentDetails.
          const hasPayload =
            'data' in handler &&
            handler.data !== undefined &&
            handler.data !== null;

          return new BaseResponse(
            handler.message,
            hasPayload ? handler.data : handler,
            ResponseStatus.SUCCESS,
            handler.meta,
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
