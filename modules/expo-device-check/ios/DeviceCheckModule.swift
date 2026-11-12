import ExpoModulesCore
import DeviceCheck

public class DeviceCheckModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeviceCheck")

    AsyncFunction("isSupported") { () -> Bool in
      if #available(iOS 11.0, *) {
        return DCDevice.current.isSupported
      }
      return false
    }

    AsyncFunction("generateToken") { (promise: Promise) in
      if #available(iOS 11.0, *) {
        guard DCDevice.current.isSupported else {
          promise.reject("ERR_DEVICECHECK_UNSUPPORTED", "DeviceCheck is not available on this device.")
          return
        }
        DCDevice.current.generateToken { data, error in
          if let error = error {
            promise.reject("ERR_DEVICECHECK_TOKEN", error.localizedDescription)
            return
          }
          guard let data = data else {
            promise.reject("ERR_DEVICECHECK_TOKEN", "DeviceCheck returned an empty token.")
            return
          }
          promise.resolve(data.base64EncodedString())
        }
        return
      }
      promise.reject("ERR_DEVICECHECK_UNSUPPORTED", "DeviceCheck is not available on this device.")
    }
  }
}
