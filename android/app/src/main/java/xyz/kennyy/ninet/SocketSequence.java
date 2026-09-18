package xyz.kennyy.ninet;

/** A fresh instance belongs to one authenticated socket, never reused after reconnect. */
final class SocketSequence {
  private long last;

  void accept(long sequence) {
    if (sequence != last + 1 || sequence <= 0)
      throw new IllegalArgumentException("Socket sequence");
    last = sequence;
  }
}
