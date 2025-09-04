module.exports = {
  dependencies: {
    'react-native-vector-icons': {
      platforms: {
        ios: {
          xcodeprojPath: 'ios/InvestorShiksha.xcodeproj',
          plistPath: 'ios/InvestorShiksha/Info.plist',
        },
      },
    },
    'react-native-push-notification': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-push-notification/android',
          packageImportPath: 'io.invertase.firebase.RNFirebasePackage',
        },
      },
    },
  },
  assets: ['./src/assets/fonts/', './src/assets/images/'],
};
