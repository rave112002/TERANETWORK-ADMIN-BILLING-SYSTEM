import LoadingModal from "@components/loading/LoadingModal";
import { MessageContext } from "@helpers/message-context";
import imageCompression from "browser-image-compression";
import { useCallback, useContext, useState } from "react";

export const useImageCompressor = () => {
  const message = useContext(MessageContext);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);

  const dataURLtoFile = async (dataurl, filename) => {
    var arr = dataurl.split(","),
      mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[arr.length - 1]),
      n = bstr.length,
      u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    const ext = mime.split("/")[1];
    filename = filename || `file.${ext}`;
    if (!filename.includes(".")) {
      filename += `.${ext}`;
    }

    return new File([u8arr], filename, { type: mime });
  };

  const validateImageFile = (file) => {
    if (!file?.type?.startsWith("image/")) {
      message.error("Please upload a valid image file.");
      return false;
    }
    return true;
  };

  // Progress callback for image compression
  const onProgress = useCallback((progress) => {
    setCompressionProgress(Math.round(progress));
  }, []);

  const imageCompressor = async (imageFile, base64 = false) => {
    if (!imageFile) return;
    if (!base64 && !validateImageFile(imageFile)) return;

    setIsCompressing(true);
    setCompressionProgress(0);

    try {
      let file = imageFile;
      if (base64) {
        setCompressionProgress(10); // Initial progress for conversion
        file = await dataURLtoFile(file, "photo.png");
        setCompressionProgress(20);
      }

      const compressedBlob = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1080,
        fileType: "image/png",
        onProgress: onProgress,
      });

      setCompressionProgress(100);

      // Small delay to show completion
      await new Promise((resolve) => setTimeout(resolve, 300));

      return new File([compressedBlob], "photo.png", { type: "image/png" });
    } catch (error) {
      message.error("Failed to compress image. Please try again.");
      throw error;
    } finally {
      setIsCompressing(false);
      setCompressionProgress(0);
    }
  };

  const imageCompressorJpg = async (imageFile, base64 = false) => {
    if (!imageFile) return;
    if (!base64 && !validateImageFile(imageFile)) return;

    setIsCompressing(true);
    setCompressionProgress(0);

    try {
      let file = imageFile;
      if (base64) {
        setCompressionProgress(10); // Initial progress for conversion
        file = await dataURLtoFile(file, "photo.jpg");
        setCompressionProgress(20);
      }

      const compressedBlob = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1080,
        fileType: "image/jpeg",
        onProgress: onProgress,
      });

      setCompressionProgress(100);

      // Small delay to show completion
      await new Promise((resolve) => setTimeout(resolve, 300));

      return new File([compressedBlob], "photo.jpg", { type: "image/jpeg" });
    } catch (error) {
      message.error("Failed to compress image. Please try again.");
      throw error;
    } finally {
      setIsCompressing(false);
      setCompressionProgress(0);
    }
  };

  const UploadLoading = () => (
    <LoadingModal
      open={isCompressing}
      progress={compressionProgress}
      message={
        compressionProgress === 0
          ? "Initializing compression..."
          : compressionProgress === 100
            ? "Finalizing..."
            : "Compressing your image..."
      }
    />
  );

  return { imageCompressor, imageCompressorJpg, UploadLoading };
};
