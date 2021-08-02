import aws from 'aws-sdk';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuid } from 'uuid';
import path from 'path';

// https://docs.min.io/docs/how-to-use-aws-sdk-for-javascript-with-minio-server.html
const s3 = new aws.S3({
  accessKeyId: process.env.S3_ACCESSKEY,
  secretAccessKey: process.env.S3_SECRETKEY,
  endpoint: process.env.REACT_APP_S3_URL,
  s3ForcePathStyle: true, // needed with minio?
  signatureVersion: 'v4'
});

// https://stackoverflow.com/a/61029813/8805016
// https://stackoverflow.com/a/58495731/8805016
// https://stackoverflow.com/a/12737295/8805016
// https://www.youtube.com/watch?v=PkF_pk_nS-c
export function uploadFile(destinationPath, fileName) {
  return function (req, res, next) {
    const multerInstance = multer({
      storage: multerS3({
        s3,
        bucket: 'media',
        metadata: (req, file, cb) => {
          cb(null, {fieldName: file.fieldname})
        },
        key: (req, file, cb) => {
          let ext = path.extname(file.originalname);
          if(file.originalname === 'blob' && file.mimetype === 'image/png')
            ext = '.png';
          cb(null, `${destinationPath}/${uuid()}${ext}`);
        }
      })
    }).single(fileName);

    multerInstance(req, res, function(err) {
      if(err) {
        console.error(err);
        return res.sendStatus(500);
      }
      if(req.file) {
        let url = new URL(req.file.location);
        req.file.location = url.pathname;
      }
      next();
    })
  }
}

export const deleteFile = () => {console.log('hi')};