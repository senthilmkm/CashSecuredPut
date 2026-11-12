package expo.modules.devicecheck

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeviceCheckModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceCheck")

    AsyncFunction("isSupported") {
      false
    }

    AsyncFunction("generateToken") {
      error("DeviceCheck is available on iOS only.")
    }
  }
}
