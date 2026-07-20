import { refbrgy, refcitymun, refprovince, refregion } from "@assets/address";
import { decodeHTML } from "./decode-html";

export const formatAddress = ({
  address1,
  address2,
  city,
  province,
  region,
  zipCode,
}) => {
  return [
    address1 ? `${address1},` : "",
    address2 ? `${address2},` : "",
    city ? `${city},` : "",
    province ? `${province},` : "",
    region ? `${region},` : "",
    zipCode || "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/,\s*$/, "");
};

export const capitalizeFirstLetter = (string) => {
  if (!string) return "";
  return string?.charAt(0).toUpperCase() + string?.slice(1);
};

export const formatAddressByCode = ({
  address1,
  address2,
  brgy,
  city,
  province,
  region,
  zipCode,
}) => {
  return decodeHTML(
    [
      address1 ? `${address1},` : "",
      address2 ? `${address2},` : "",
      brgy
        ? `${refbrgy?.find((item) => item.brgyCode === brgy)?.brgyDesc},`
        : "",
      city
        ? `${refcitymun?.find((item) => item.citymunCode === city)?.citymunDesc},`
        : "",
      province
        ? `${refprovince?.find((item) => item.provCode === province)?.provDesc},`
        : "",
      region
        ? `${refregion?.find((item) => item.regCode === region)?.regDesc},`
        : "",
      zipCode || "",
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/,\s*$/, "")
  );
};
