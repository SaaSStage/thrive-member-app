package expo.modules.voicerecorder

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.RandomAccessFile
import kotlin.concurrent.thread

/**
 * Thin owned recorder: captures 16-bit PCM mono WAV at 44.1 kHz via Android's
 * AudioRecord and writes a streamed WAV file (header patched on stop). Pure
 * Kotlin / Expo Modules API — no C++/CMake/codegen, so it sidesteps the
 * third-party native-build failures (@siteed/audio-studio, react-native-audio-api)
 * on this RN 0.85 / New Arch / Windows stack. Matches the analyze-voice pipeline's
 * required format exactly.
 */
class VoiceRecorderModule : Module() {
  private val sampleRate = 44100
  private val channels = 1
  private val bitsPerSample = 16

  private var recorder: AudioRecord? = null
  private var recordingThread: Thread? = null
  @Volatile private var recording = false
  private var currentFile: File? = null
  @Volatile private var totalDataBytes = 0L

  override fun definition() = ModuleDefinition {
    Name("VoiceRecorder")

    Constants(
      "sampleRate" to sampleRate,
      "channels" to channels,
      "bitsPerSample" to bitsPerSample,
    )

    AsyncFunction("hasPermission") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED
    }

    // `filename` is just a leaf name; the module owns the cache location and
    // returns the resulting file:// uri on stop.
    AsyncFunction("startRecording") { filename: String ->
      startRecordingInternal(filename)
    }

    AsyncFunction("stopRecording") {
      stopRecordingInternal()
    }

    AsyncFunction("cancelRecording") {
      cancelRecordingInternal()
    }
  }

  private fun startRecordingInternal(filename: String) {
    if (recording) throw CodedException("ERR_ALREADY_RECORDING", "Already recording.", null)
    val ctx = appContext.reactContext
      ?: throw CodedException("ERR_NO_CONTEXT", "No React context.", null)
    if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      throw CodedException("ERR_NO_PERMISSION", "Microphone permission not granted.", null)
    }

    val dir = File(ctx.cacheDir, "voice_recordings").apply { mkdirs() }
    val file = File(dir, filename)
    val minBuf = AudioRecord.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    )
    if (minBuf <= 0) throw CodedException("ERR_BUFFER", "Invalid AudioRecord buffer size.", null)
    val bufferSize = maxOf(minBuf, sampleRate * 2) // ~1s

    val rec = try {
      @Suppress("MissingPermission")
      AudioRecord(
        MediaRecorder.AudioSource.MIC,
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufferSize,
      )
    } catch (e: Exception) {
      throw CodedException("ERR_INIT", "Could not init AudioRecord: ${e.message}", e)
    }
    if (rec.state != AudioRecord.STATE_INITIALIZED) {
      rec.release()
      throw CodedException("ERR_INIT", "AudioRecord failed to initialize.", null)
    }

    recorder = rec
    currentFile = file
    totalDataBytes = 0L
    recording = true

    val raf = RandomAccessFile(file, "rw")
    raf.setLength(0)
    writeWavHeader(raf, 0)
    rec.startRecording()

    recordingThread = thread(name = "voice-recorder") {
      val buffer = ByteArray(bufferSize)
      try {
        while (recording) {
          val read = rec.read(buffer, 0, buffer.size)
          if (read > 0) {
            raf.write(buffer, 0, read)
            totalDataBytes += read
          }
        }
      } catch (_: Exception) {
        // Surfaced via stop returning a short/zero file; validation catches it.
      } finally {
        try {
          raf.seek(4); writeIntLE(raf, (36 + totalDataBytes).toInt())
          raf.seek(40); writeIntLE(raf, totalDataBytes.toInt())
        } catch (_: Exception) {}
        try { raf.close() } catch (_: Exception) {}
      }
    }
  }

  private fun stopRecordingInternal(): Map<String, Any?> {
    if (!recording) throw CodedException("ERR_NOT_RECORDING", "Not recording.", null)
    recording = false
    try { recorder?.stop() } catch (_: Exception) {}
    recordingThread?.join(2000)
    recorder?.release()
    recorder = null
    recordingThread = null

    val file = currentFile ?: throw CodedException("ERR_NO_FILE", "No output file.", null)
    val bytesPerSecond = sampleRate * channels * (bitsPerSample / 8)
    val durationMs = if (bytesPerSecond > 0) (totalDataBytes * 1000 / bytesPerSecond) else 0L
    val result = mapOf(
      "uri" to "file://${file.absolutePath}",
      "durationMs" to durationMs.toInt(),
      "sampleRate" to sampleRate,
      "channels" to channels,
      "bytes" to (totalDataBytes + 44),
    )
    currentFile = null
    return result
  }

  private fun cancelRecordingInternal() {
    if (recording) {
      recording = false
      try { recorder?.stop() } catch (_: Exception) {}
      recordingThread?.join(2000)
    }
    recorder?.release()
    recorder = null
    recordingThread = null
    try { currentFile?.delete() } catch (_: Exception) {}
    currentFile = null
  }

  // ---- WAV header helpers (little-endian PCM) ------------------------------

  private fun writeWavHeader(raf: RandomAccessFile, dataLen: Int) {
    val byteRate = sampleRate * channels * (bitsPerSample / 8)
    raf.seek(0)
    raf.writeBytes("RIFF")
    writeIntLE(raf, 36 + dataLen)
    raf.writeBytes("WAVE")
    raf.writeBytes("fmt ")
    writeIntLE(raf, 16) // PCM fmt chunk size
    writeShortLE(raf, 1) // audioFormat = PCM
    writeShortLE(raf, channels.toShort())
    writeIntLE(raf, sampleRate)
    writeIntLE(raf, byteRate)
    writeShortLE(raf, (channels * (bitsPerSample / 8)).toShort()) // block align
    writeShortLE(raf, bitsPerSample.toShort())
    raf.writeBytes("data")
    writeIntLE(raf, dataLen)
  }

  private fun writeIntLE(raf: RandomAccessFile, value: Int) {
    raf.write(value and 0xff)
    raf.write((value shr 8) and 0xff)
    raf.write((value shr 16) and 0xff)
    raf.write((value shr 24) and 0xff)
  }

  private fun writeShortLE(raf: RandomAccessFile, value: Short) {
    val v = value.toInt()
    raf.write(v and 0xff)
    raf.write((v shr 8) and 0xff)
  }
}
