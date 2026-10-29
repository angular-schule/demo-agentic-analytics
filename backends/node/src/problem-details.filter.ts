import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { InvalidQueryError } from './semantic/sales-model';

const TYPES: Record<number, string> = {
  400: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
  404: 'https://tools.ietf.org/html/rfc9110#section-15.5.5',
  500: 'https://tools.ietf.org/html/rfc9110#section-15.6.1',
};

/**
 * Answers every error as RFC 9457 problem details, the same format the ASP.NET Core backend uses.
 * Requests outside the semantic layer get 400 with a message naming the allowed values.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let status = 500;
    let title = 'An error occurred while processing your request.';
    let detail: string | undefined;

    if (exception instanceof InvalidQueryError) {
      status = 400;
      title = 'Invalid query';
      detail = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      title = exception.message;
      if (status === 400) {
        // Validation errors of the request body.
        const body = exception.getResponse();
        const message = typeof body === 'object' && body !== null && 'message' in body ? body.message : body;
        title = 'Invalid query';
        detail = Array.isArray(message) ? message.join('; ') : String(message);
      }
    } else {
      this.logger.error(exception);
    }

    void reply
      .status(status)
      .type('application/problem+json')
      .send({ type: TYPES[status], title, status, ...(detail ? { detail } : {}) });
  }
}
