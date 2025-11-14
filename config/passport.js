var JwtStrategy = require("passport-jwt").Strategy;
var ExtractJwt = require("passport-jwt").ExtractJwt;
const process = require("process");

var User = require("../models/user");

module.exports = function (passport) {
  var opts = {};
  opts.secretOrKey = process.env.PUBLIC_KEY;
  opts.jwtFromRequest = ExtractJwt.fromUrlQueryParameter("token");

  passport.use(
    new JwtStrategy(opts, async function (jwt_payload, done) {
      try {
        const user = await User.findOne({ id: jwt_payload.id });
        if (user) {
          return done(null, user);
        } else {
          return done(null, false);
        }
      } catch (err) {
        return done(err, false);
      }
    }),
  );
};
