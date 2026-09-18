package xyz.kennyy.ninet;

import static org.junit.Assert.*;

import org.junit.Test;

public class SocketSequenceTest {
  @Test
  public void rejectsReplayGapsAndOutOfOrderEvents() {
    SocketSequence sequence = new SocketSequence();
    assertThrows(IllegalArgumentException.class, () -> sequence.accept(0));
    assertThrows(IllegalArgumentException.class, () -> sequence.accept(2));
    sequence.accept(1);
    assertThrows(IllegalArgumentException.class, () -> sequence.accept(1));
    assertThrows(IllegalArgumentException.class, () -> sequence.accept(3));
    sequence.accept(2);
  }

  @Test
  public void newConnectionStartsAtOne() {
    SocketSequence old = new SocketSequence();
    old.accept(1);
    old.accept(2);
    SocketSequence fresh = new SocketSequence();
    assertThrows(IllegalArgumentException.class, () -> fresh.accept(3));
    fresh.accept(1);
  }
}
