import { Request, Response } from "express";

const functions = {
  getLatestAndroidVersionDetails: function (_: Request, res: Response) {
    return res.status(201).send({ message: "No new Android version details." });
    // res.status(200).send({
    //   announcement: {
    //     title: "We Need You!",
    //     body: "To re-publish BEACON Q in the Play Store, we require some beta testers with an Android device to help us out. Please contact us via email if you are interested!",
    //     url: "https://pub.dev/packages/json_serializable",
    //     email: "coast@uni.lu",
    //   },
    //   latestAPK: {
    //     versionCode: 73,
    //     versionNumber: "6.1.2",
    //     description: "Bug fixes",
    //     warning: "Ensure your Android version is 6.0 or higher!",
    //     instructions: "Follow these steps to retrieve it.",
    //     apkURL: "",
    //   },
    //   newPlayStoreListing: {
    //     versionCode: 71,
    //     versionNumber: "6.1.0",
    //     message: "",
    //     instructions: "",
    //     warning: "",
    //     playStoreURL:
    //       "https://play.google.com/store/apps/details?id=lu.uni.coast.beacon_app&hl=de",
    //     disableCourseRegistrations: false,
    //     disableAppFunctionalities: false,
    //   },
    // });
  },
  //   getLatestAndroidAPKDetails: function (_: Request, res: Response) {
  //     res.status(200).send({
  //       versionCode: 71,
  //       versionNumber: "6.1.0",
  //       description: "Bug fixes",
  //       warning: "",
  //       instructions: "Follow these steps to retrieve it.",
  //       apkURL: "",
  //     });
  //   },
  //   getNewPlayStoreListingDetails: function (_: Request, res: Response) {
  //     res.status(200).send({
  //       versionCode: 71,
  //       versionNumber: "6.1.0",
  //       message: "Install the app from the Play Store!",
  //       instructions: "Follow these steps to retrieve it.",
  //       warning: "",
  //       playStoreURL: "",
  //       disableCourseRegistrations: false,
  //       disableAppFunctionalities: false,
  //     });
  //   },
};

export default functions;
