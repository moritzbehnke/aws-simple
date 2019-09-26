import {
  DomainNameOptions,
  MethodDeploymentOptions,
  MethodLoggingLevel,
  RestApi,
  StageOptions
} from '@aws-cdk/aws-apigateway';
import {Certificate} from '@aws-cdk/aws-certificatemanager';
import {
  Policy,
  PolicyStatement,
  Role,
  ServicePrincipal
} from '@aws-cdk/aws-iam';
import {ARecord, HostedZone, RecordTarget} from '@aws-cdk/aws-route53';
import {ApiGateway} from '@aws-cdk/aws-route53-targets';
import {Bucket} from '@aws-cdk/aws-s3';
import {App, CfnOutput, Duration, Stack} from '@aws-cdk/core';
import * as path from 'path';
import {CustomDomainConfig, LambdaConfig, LoggingLevel, Resources} from '..';
import {AppConfig, ResourceIds} from './app-config';

function createDomainNameOptions(
  resourceIds: ResourceIds,
  stack: Stack,
  customDomainConfig: CustomDomainConfig
): DomainNameOptions | undefined {
  const {certificateArn, hostedZoneName, aliasRecordName} = customDomainConfig;

  return {
    domainName: aliasRecordName
      ? `${aliasRecordName}.${hostedZoneName}`
      : hostedZoneName,
    certificate: Certificate.fromCertificateArn(
      stack,
      resourceIds.certificate,
      certificateArn
    )
  };
}

function createStageOptions(
  lambdaConfigs: LambdaConfig[],
  loggingLevel: LoggingLevel | undefined
): StageOptions {
  const restApiMethodOptions: Record<string, MethodDeploymentOptions> = {};

  let rootCachingEnabled = false;
  let rootCacheTtl: Duration | undefined;

  const cacheClusterEnabled = lambdaConfigs.some(
    ({cachingEnabled}) => cachingEnabled
  );

  if (cacheClusterEnabled) {
    for (const lambdaConfig of lambdaConfigs) {
      const {
        httpMethod,
        publicPath,
        cachingEnabled,
        cacheTtlInSeconds
      } = lambdaConfig;

      if (publicPath === '/') {
        if (cachingEnabled) {
          rootCachingEnabled = cachingEnabled;
        }

        if (cacheTtlInSeconds) {
          rootCacheTtl = Duration.seconds(cacheTtlInSeconds);
        }
      } else {
        restApiMethodOptions[path.join(publicPath, httpMethod)] = {
          cachingEnabled: Boolean(cachingEnabled),
          cacheTtl:
            cacheTtlInSeconds !== undefined
              ? Duration.seconds(cacheTtlInSeconds)
              : undefined
        };
      }
    }
  }

  return {
    cacheClusterEnabled,
    cachingEnabled: rootCachingEnabled,
    cacheTtl: rootCacheTtl,
    methodOptions: restApiMethodOptions,
    loggingLevel: loggingLevel && MethodLoggingLevel[loggingLevel]
  };
}

export function createStack(appConfig: AppConfig): Resources {
  const {outputIds, resourceIds, stackConfig} = appConfig;

  const {
    customDomainConfig,
    binaryMediaTypes,
    minimumCompressionSize,
    loggingLevel,
    lambdaConfigs = []
  } = stackConfig;

  const stack = new Stack(new App(), resourceIds.stack);

  const restApi = new RestApi(stack, resourceIds.restApi, {
    domainName:
      customDomainConfig &&
      createDomainNameOptions(resourceIds, stack, customDomainConfig),
    binaryMediaTypes,
    minimumCompressionSize,
    deployOptions: createStageOptions(lambdaConfigs, loggingLevel)
  });

  const restApiUrlOutput = new CfnOutput(stack, resourceIds.restApiUrlOutput, {
    value: restApi.url,
    exportName: outputIds.restApiUrl
  });

  restApiUrlOutput.node.addDependency(restApi);

  if (customDomainConfig && customDomainConfig.aliasRecordName) {
    const {hostedZoneId, hostedZoneName, aliasRecordName} = customDomainConfig;

    const aRecord = new ARecord(stack, resourceIds.aRecord, {
      zone: HostedZone.fromHostedZoneAttributes(stack, resourceIds.zone, {
        hostedZoneId,
        zoneName: hostedZoneName
      }),
      recordName: aliasRecordName,
      target: RecordTarget.fromAlias(new ApiGateway(restApi))
    });

    aRecord.node.addDependency(restApi);
  }

  const s3Bucket = new Bucket(stack, resourceIds.s3Bucket, {
    publicReadAccess: false
  });

  const s3BucketNameOutput = new CfnOutput(
    stack,
    resourceIds.s3BucketNameOutput,
    {value: s3Bucket.bucketName, exportName: outputIds.s3BucketName}
  );

  s3BucketNameOutput.node.addDependency(s3Bucket);

  const s3IntegrationRole = new Role(stack, resourceIds.s3IntegrationRole, {
    assumedBy: new ServicePrincipal('apigateway.amazonaws.com')
  });

  const s3IntegrationPolicy = new Policy(
    stack,
    resourceIds.s3IntegrationPolicy,
    {
      statements: [new PolicyStatement({actions: ['s3:*'], resources: ['*']})],
      roles: [s3IntegrationRole]
    }
  );

  s3IntegrationPolicy.node.addDependency(s3IntegrationRole);

  return {stack, restApi, s3Bucket, s3IntegrationRole};
}