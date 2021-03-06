import {MethodResponse} from '@aws-cdk/aws-apigateway';
import {S3FileConfig, StackConfig} from '../../types';

export function createS3MethodResponses(
  stackConfig: StackConfig,
  s3FileConfig: S3FileConfig
): MethodResponse[] {
  const corsResponseParameters: Record<string, boolean> = stackConfig.enableCors
    ? {'method.response.header.Access-Control-Allow-Origin': true}
    : {};

  const status200ResponseParameters: Record<string, boolean> = {
    ...corsResponseParameters,
    'method.response.header.Content-Type': true,
  };

  const {responseHeaders} = s3FileConfig;

  if (responseHeaders) {
    const {cacheControl} = responseHeaders;

    if (cacheControl) {
      status200ResponseParameters[
        'method.response.header.Cache-Control'
      ] = true;
    }
  }

  return [
    {statusCode: '200', responseParameters: status200ResponseParameters},
    {statusCode: '404', responseParameters: corsResponseParameters},
    {statusCode: '500', responseParameters: corsResponseParameters},
  ];
}
