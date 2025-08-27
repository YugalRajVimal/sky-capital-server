import fs from "fs";

function deleteUploadedFile(file) {
  if (file == null) return;
  fs.unlink(file.path, (err) => {
    if (err) {
      console.log(`Failed to delete file: ${file.path}`, err);
    } else {
      console.log(`Deleted file: ${file.path}`);
    }
  });
}

function deleteUploadedFiles(files) {
  if (Array.isArray(files)) {
    files.forEach((file) => deleteUploadedFile(file));
  }
}

export { deleteUploadedFile, deleteUploadedFiles };
