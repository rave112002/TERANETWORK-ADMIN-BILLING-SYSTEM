import "moment-timezone";
import fs from "fs";
import path from "path";
import mime from "mime";
import { createCanvas, Image } from "canvas";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



export const draw = function ({ fullname,registerAs, qrcode }) {
  return new Promise((resolve, reject) => {
    const badge = (registerAs === "Exhibitor") ? "badge_blue.png" : "badge_red.png"
    console.log({ fullname,registerAs, qrcode });
    const templateFile = path.resolve(__dirname, `./templates/${badge}`);
    const templateBase64 = fs.readFileSync(templateFile).toString("base64");

    const canvas = createCanvas(1200, 1800);
    const context = canvas.getContext("2d");

    const templateImg = new Image();
    const qrcodeImg = new Image();

  // registerFont(path.join(__dirname,"fonts", "Bantayog-Semilight.ttf"), {
  //   family: "Bantayog",
  //   weight: 700,
  //   style: "bold",
  // });

  // registerFont(path.join(__dirname,"fonts", "Bantayog-Regular.ttf"), {
  //   family: "Bantayog",
  //   weight: 600,
  //   style: "normal",
  // });
  // registerFont(path.join(__dirname,"fonts", "Bantayog-Light.ttf"), {
  //   family: "Bantayog",
  //   weight: 400,
  //   style: "normal",
  // });

  templateImg.onload = () => {
    context.drawImage(templateImg, 0, 0, canvas.width, canvas.height);

    qrcodeImg.onload = () => {
      context.drawImage(
        qrcodeImg,
        (1200 - 620) / 2, 590, 620, 620
      );

      context.fillStyle = "black";
      context.textBaseline = "middle";
      context.textAlign = "center";

      // context.font = "600 72px 'Arial'";
      // context.fillText(
      //   event.date,
      //   context.canvas.width * 0.5, 1500
      // );


      // context.font = "900 72px 'Arial Black'";
      // context.fillText(
      //   registerAs.toUpperCase(),
      //   context.canvas.width * 0.5, 1650
      // );
     
      const name = fullname;

      if (name.length > 30) {
        context.font = "700 40pt 'Arial'";
        name
          .split(" ")
          .map((obj, i) =>
            context.fillText(
              obj,
              canvas.width * 0.5,
              1100 - name.split(" ").length * 20 + i * 50
            )
          );
      }else {
        context.font = "700 30pt 'Arial'";
        context.fillText(name, canvas.width * 0.5, 1300, 1000);
      }

      // context.fillText(
      //   toUpper(attendeeName),
      //   context.canvas.width * 0.5,
      //   context.canvas.height * 0.595
      // );

      // Resolve the promise with the canvas when drawing is complete
      resolve(canvas);
    };

    qrcodeImg.src = qrcode;
  };

  templateImg.onerror = (error) => {
    reject(new Error('Failed to load template image: ' + error));
  };

  qrcodeImg.onerror = (error) => {
    reject(new Error('Failed to load QR code image: ' + error));
  };

  templateImg.src = "data:{mediatype};base64,{base64}"
    .replace("{mediatype}", mime.getType(templateFile))
    .replace("{base64}", templateBase64);
  });
};



    