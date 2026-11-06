Pod::Spec.new do |s|
  s.name           = 'SceneCapture'
  s.version        = '1.0.0'
  s.summary        = "Captures the YoungVista 3D view (ViroReact's GLKView) as a JPEG."
  s.description    = "Captures the YoungVista 3D view (ViroReact's GLKView) as a JPEG, for the final picture."
  s.license        = 'UNLICENSED'
  s.author         = 'Young Corporation of America'
  s.homepage       = 'https://young-vista.web.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'GLKit', 'UIKit'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # ViroKit draws with OpenGL ES (GLKit), deprecated by Apple but still what it uses.
    'OTHER_SWIFT_FLAGS' => '$(inherited) -Xcc -DGLES_SILENCE_DEPRECATION'
  }
end
