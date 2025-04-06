/// <reference types="expo/types/expo-modules" />

// Use this file to declare and provide types for non-code assets
declare module "*.png" {
  const value: any;
  export = value;
}

declare module "*.jpg" {
  const value: any;
  export = value;
}

declare module "*.svg" {
  import React from "react";
  import { SvgProps } from "react-native-svg";
  const content: React.FC<SvgProps>;
  export default content;
}

// Declare any other file types your app uses
declare module "*.json" {
  const value: any;
  export default value;
}