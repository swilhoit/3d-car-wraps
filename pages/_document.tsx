import React from 'react';
import { Html, Head, Main, NextScript } from 'next/document';

export default class Document extends React.Component {
  render() {
    return (
      <Html lang="en">
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}