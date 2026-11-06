Pod::Spec.new do |s|
  s.name           = 'RoomCapture'
  s.version        = '1.0.0'
  s.summary        = "Posed ARKit keyframes from YoungVista's AR view, for the turn-around scan."
  s.description    = "Samples the ARKit session behind ViroReact's AR view (through ViroKit's shipped headers) and writes the frames the app keeps as full-size JPEGs with their pose, for the turn-around room scan."
  s.license        = 'UNLICENSED'
  s.author         = 'Young Corporation of America'
  s.homepage       = 'https://young-vista.web.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # The AR view and its session: VROViewAR -getARSession, VROARSessioniOS::getARSession().
  s.dependency 'ViroKit'
  s.frameworks = 'ARKit', 'CoreImage', 'CoreVideo', 'GLKit', 'ImageIO', 'UIKit'

  s.source_files = '**/*.{h,m,mm,swift}'
  # Swift sees only this plain Objective-C header; ViroKit's C++ stays inside the .mm file.
  s.public_header_files = 'RCSessionAccess.h'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # ViroKit's headers are C++17, as in ViroReact's own podspec.
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    # ViroKit draws with OpenGL ES (GLKit), deprecated by Apple but still what it uses.
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) GLES_SILENCE_DEPRECATION=1',
    # Warnings from inside ViroKit's own headers (its comments, glm, missing `override`s).
    'WARNING_CFLAGS' => '$(inherited) -Wno-documentation -Wno-documentation-html ' \
                        '-Wno-inconsistent-missing-override -Wno-nullability-completeness'
  }
end
