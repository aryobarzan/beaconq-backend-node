import {
  Strategy as JwtStrategy,
  ExtractJwt,
  StrategyOptionsWithRequest,
} from "passport-jwt";
import { PassportStatic } from "passport";
import process from "process";
import { UserModel } from "../models/user";

export default function (passport: PassportStatic) {
  const opts: StrategyOptionsWithRequest = {
    secretOrKey: process.env.PUBLIC_KEY,
    jwtFromRequest: ExtractJwt.fromUrlQueryParameter("token"),
    passReqToCallback: true,
  };

  passport.use(
    new JwtStrategy(opts, async function (req, jwt_payload, done) {
      try {
        const user = await UserModel.findOne({ id: jwt_payload.id });
        if (user) {
          return done(null, user);
        } else {
          return done(null, false);
        }
      } catch (err: unknown) {
        return done(err, false);
      }
    }),
  );
}
