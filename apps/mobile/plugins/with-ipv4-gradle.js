const { withGradleProperties, createRunOncePlugin } = require('@expo/config-plugins');

function withIpv4Gradle(config) {
  return withGradleProperties(config, (config) => {
    const setProp = (key, value) => {
      const existing = config.modResults.find((p) => p.type === 'property' && p.key === key);
      if (existing) {
        existing.value = value;
      } else {
        config.modResults.push({ type: 'property', key, value });
      }
    };

    setProp('systemProp.java.net.preferIPv4Stack', 'true');
    setProp('systemProp.java.net.preferIPv4Addresses', 'true');
    setProp(
      'org.gradle.jvmargs',
      '-Xmx2048m -XX:MaxMetaspaceSize=512m -Djava.net.preferIPv4Stack=true -Djava.net.preferIPv4Addresses=true'
    );

    return config;
  });
}

module.exports = createRunOncePlugin(withIpv4Gradle, 'with-ipv4-gradle', '1.0.0');
