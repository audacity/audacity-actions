# audacity-actions

A set of GitHub Actions to simplify Audacity build workflows. Most of these actions are written in JavaScript and require Node 16 to run.

It is possible to locally debug the actions by settings certain environment values:
* `GITHUB_WORKSPACE`: path to audacity source code
* `INPUT_*`: input value. For example, input named `configuration_types` can be passed using `INPUT_CONFIGURATION_TYPES` environment variable.
* Variables, set by a previous step.

##  audacity/audacity-actions/dependencies@v1

This action setups the environment required to build Audacity:
* Conan 1.43.2,
* Required Linux libraries when running on Linux.

This action allows switching to GCC11 on Linux using the `force_gcc11` parameter.
This action is a "composite" action; it is impossible to debug it locally.

## audacity/audacity-actions/configure@v1

Configure Audacity using provided options:
* `generator`: CMake generator to use. Required.
* `arch`: Host architecture (i. e., the resulting binaries architecture) in NodeJS format (`x64`, `x32`, `arm64`). Windows builds support `x32` and `x64`, macOS builds support `x64` and `arm64` values. Optional. The default value is x64.
* `build_level`: Audacity build level. Can be one of `alpha`, `beta`, or `release`. Optional. The default value is `alpha`.
* `configuration_types`: This value is used to initialize `CMAKE_CONFIGURATION_TYPES`. Valid values are: `Debug`, `Release`, `RelWithDebInfo`, `MinSizeRel` or any combination concatenated with semicolon. Optional. The default value is `RelWithDebInfo`.
 * `build_type`: CMake build type (or configuration) to use for the build. Valid values are: `Debug`, `Release`, `RelWithDebInfo`, `MinSizeRel`. Optional. The default value is `RelWithDebInfo`.
* `cmake_options`: Additional CMake options to pass to CMake. Optional.
* `image_compiler`: Path to the `image-compiler` executable. Required when cross-compiling and the build platform can not run the application with host architecture. For example, when building for AppleSilicon on Intel Mac.
* `windows_certificate`: Base 64 of PFX file with the code signing certificate on Windows. Optional.
* `windows_certificate_password`: Password to the PFX file with the code signing certificate.
* `apple_codesign_identity`: Apple code-signing identity. Optional.
* `apple_notarization_user_name`: Apple notarization user name. Optional.
* `apple_notarization_password`: Apple notarization password.

It is preferred to code sign the build on macOS during the package step.

This action sets the following environment variables:
* `AUDACITY_BUILD_DIR`: CMake build directory. Equals to `.build.${arch}`.
* `AUDACITY_BUILD_TYPE`: equals to the value of `build_type`.
* `AUDACITY_BUILD_LEVEL`: numeric representation of `build_level`. 0 for `alpha`, 1 for `beta`, 2 for `release`.
* `AUDACITY_ARCH`: equals to the value of `arch`.
* `AUDACITY_CROSS_COMPILING`: equals to true if the host and build architectures do not match.

If during the configuration new Conan packages were built, the following will happen:
* On Windows, if `ARTIFACTORY_SYMBOLS_URL` and `ARTIFACTORY_SYMBOLS_KEY` are present in the environment - debug information will be uploaded to Artifactory in SymStore format.
* When `SENTRY_AUTH_TOKEN`, `SENTRY_HOST`, `SENTRY_ORG_SLUG`, and `SENTRY_PROJECT_SLUG` are present in the environment - debug and source information is uploaded to Sentry.
* When `CONAN_BINARIES_REMOTE`, `CONAN_LOGIN_USERNAME`, and `CONAN_PASSWORD` are present in the environment - newly built binaries are uploaded to Conan.
## audacity/audacity-actions/build@v1

Build Audacity. Allows setting the target with the optional parameter `target`.

When `SENTRY_AUTH_TOKEN`, `SENTRY_HOST`, `SENTRY_ORG_SLUG`, and `SENTRY_PROJECT_SLUG` are present in the environment and `build_level` is not `alpha`  - debug and source information is uploaded to Sentry.


##  audacity/audacity-actions/package@v1

Package Audacity and upload the resulting artifacts.

Supported parameters:
* `postfix`: a postfix to add to the artifact.
* ` cmake_options`: additional options to pass to CMake.

### Windows

Action creates a zipped version of Audacity. If `build_level` is not `alpha` - action will generate an installer as well.

### Linux

Action creates an AppImage.

### macOS

On macOS, action can be parametrized:
* `apple_codesign_identity`: Apple code-signing identity. Optional.
* `apple_notarization_user_name`: Apple notarization user name. Optional.
* `apple_notarization_password`: Apple notarization password.
* `archs`: list of architectures to package, in NodeJS format, one per line. If more than one architecture is provided, an universal binary will be created as well.

## Building Actions

Building a GitHub suitable package is only possible on macOS now.
