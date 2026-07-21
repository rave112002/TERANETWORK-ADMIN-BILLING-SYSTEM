import bcrypt from "bcrypt";
import APIError from "../APIError.js";
const hashPassword = async (password) => {
  try {
    const salt = process.env.saltRounds;
    const pass = await bcrypt.hash(password, parseInt(salt)).then((hash) => {
      return hash;
    });
    return pass;
  } catch (_error) {
    throw new APIError("An error occurred while generating new hash password", 500);
  }
};

const comparePassword = async (plain, hash) => {
  try {
    const hashedPasswordString = hash.toString("utf8");
    const compPass = await bcrypt.compare(plain, hashedPasswordString).then((result) => {
      return result;
    });
    return compPass;
  } catch (_error) {
    throw new APIError("An error occurred while comparing hash", 500);
  }
};

export default {
  hashPassword,
  comparePassword,
};
