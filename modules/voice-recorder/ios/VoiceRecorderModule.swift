import AVFoundation
import ExpoModulesCore

// iOS counterpart of the Android recorder: AVAudioRecorder writing Linear PCM
// WAV at 44.1 kHz / 16-bit / mono. NOTE: written for parity but NOT yet verified
// on a device (iOS testing deferred — needs a Mac per the project setup). The
// Android path is the verified one.
public class VoiceRecorderModule: Module {
  private var recorder: AVAudioRecorder?
  private var currentURL: URL?
  private let sampleRate = 44100
  private let channels = 1
  private let bitsPerSample = 16

  public func definition() -> ModuleDefinition {
    Name("VoiceRecorder")

    Constants([
      "sampleRate": sampleRate,
      "channels": channels,
      "bitsPerSample": bitsPerSample,
    ])

    AsyncFunction("hasPermission") { () -> Bool in
      return AVAudioSession.sharedInstance().recordPermission == .granted
    }

    AsyncFunction("startRecording") { (filename: String) in
      try self.startRecording(filename: filename)
    }

    AsyncFunction("stopRecording") { () -> [String: Any] in
      return try self.stopRecording()
    }

    AsyncFunction("cancelRecording") {
      self.recorder?.stop()
      if let url = self.currentURL { try? FileManager.default.removeItem(at: url) }
      self.recorder = nil
      self.currentURL = nil
    }
  }

  private func startRecording(filename: String) throws {
    if recorder?.isRecording == true {
      throw Exception(name: "ERR_ALREADY_RECORDING", description: "Already recording.")
    }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
    try session.setActive(true)

    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("voice_recordings", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let url = dir.appendingPathComponent(filename)

    let settings: [String: Any] = [
      AVFormatIDKey: Int(kAudioFormatLinearPCM),
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: channels,
      AVLinearPCMBitDepthKey: bitsPerSample,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
    ]
    let rec = try AVAudioRecorder(url: url, settings: settings)
    guard rec.record() else {
      throw Exception(name: "ERR_START", description: "AVAudioRecorder failed to start.")
    }
    recorder = rec
    currentURL = url
  }

  private func stopRecording() throws -> [String: Any] {
    guard let rec = recorder, let url = currentURL else {
      throw Exception(name: "ERR_NOT_RECORDING", description: "Not recording.")
    }
    let durationMs = Int(rec.currentTime * 1000)
    rec.stop()
    recorder = nil
    currentURL = nil
    let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    return [
      "uri": url.absoluteString,
      "durationMs": durationMs,
      "sampleRate": sampleRate,
      "channels": channels,
      "bytes": bytes ?? 0,
    ]
  }
}
