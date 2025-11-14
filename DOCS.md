# Known issues

## Period (.) field key in MongoDB


# Info

- Use JSON.parse(JSON.stringify(mongooseObject)) rather than JSON.stringify on its own
  - This helps the Dio framework on the Flutter client properly decode object types, e.g., lists, rather than leaving them as raw Strings and requiring extra decoding by the client