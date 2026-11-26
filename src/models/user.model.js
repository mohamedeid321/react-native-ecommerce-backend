import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "username is required"],
      unique: true,
    },
    email: {
      type: String,
      required: [true, "email is required"],
      unique: true,
    },
    disabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false },
    googleSub: { type: String, unique: true, sparse: true, select: false },
    displayName: { type: String, maxlength: 80 },
    phone: { type: String, unique: true, sparse: true },
    password: {
      type: String,
      required: [true, "password is required"],
      minlength: 6,
    },
    courierResidence: { type: String, maxlength: 200 },
    profileImage: {
      type: String,
      default: "",
    },
    cartItems: [
      {
        quantity: {
          type: Number,
          default: 1,
        },
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
      },
    ],
    role: {
      type: String,
      enum: ["customer", "admin", "delivery"],
      default: "customer",
    },
  },
  { timestamps: true },
);

// hash password before saving user to db
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// compare password func
userSchema.methods.comparePassword = async function (userPassword) {
  return await bcrypt.compare(userPassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
