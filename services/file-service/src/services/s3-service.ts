import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';

const s3 = new S3Client({
  region: config.S3_REGION,
  ...(config.S3_ENDPOINT && { endpoint: config.S3_ENDPOINT, forcePathStyle: true }),
  ...(config.S3_ACCESS_KEY_ID && {
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
    },
  }),
});

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: config.PRESIGNED_URL_EXPIRY_SECONDS });
}

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: config.PRESIGNED_URL_EXPIRY_SECONDS });
}

export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
  });
  await s3.send(command);
}
