---
name: testing
description: Writing automated tests for software. Use when creating, modifying, or discussing tests. Covers test philosophy, sociable vs solitary tests, integration testing, and anti-patterns.
# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: CC-BY-NC-SA-4.0
---

# Testing

Guidelines for writing effective automated tests.

## Philosophy: Prefer Sociable and Integration Tests

Follow the **testing trophy** approach - value sociable and integration tests over solitary unit tests with mocks.

**Sociable Tests**
- Use real collaborating objects, not mocks
- Test the unit under test with its real dependencies
- Assume collaborators work correctly (they have their own tests)
- Tests behavior as the system actually runs

**Integration Tests**
- Verify independently developed units work together correctly
- Prefer **narrow** integration tests: test one integration point at a time
- Use test doubles (stubs/fakes) for external services
- Avoid broad integration tests that require live versions of all services

**Solitary Tests (avoid)**
- Replace all collaborators with mocks/stubs
- Creates brittle tests that break during refactoring
- Tests implementation details rather than behavior

## When to Use Test Doubles

Use stubs/fakes (not mocks) only when:
- External services you don't control
- Non-deterministic behavior (random, time, etc.)
- Extremely slow operations
- Infrastructure you can't run locally

## Anti-patterns

**Over-mocked tests:**
```java
// BAD - testing mocks, not real behavior
@Test
void processOrder() {
    var mockRepo = mock(OrderRepo.class);
    var mockNotifier = mock(Notifier.class);
    var service = new OrderService(mockRepo, mockNotifier);
    when(mockRepo.find(any())).thenReturn(fakeOrder);
    
    service.process(orderId);
    
    verify(mockNotifier).send(any());  // Verified a mock was called - not real behavior
}
```

**Testing implementation details:**
```java
// BAD - testing internal state
@Test
void parserSetsStateCorrectly() {
    var parser = new Parser();
    parser.parse("input");
    assertThat(parser.getTokenCount()).isEqualTo(3);  // Internal detail
}
```

**Testing trivial code:**
```java
// BAD - don't explicitly test getters/setters
@Test
void getterReturnsValue() {
    var person = new Person("Alice");
    assertThat(person.getName()).isEqualTo("Alice");  // No logic - redundant
}
```

Trivial code should be exercised by other tests, not explicitly tested. If it isn't covered, question whether it's needed (libraries may need explicit tests to hit coverage targets).

## Correct Approaches

**Sociable test with real collaborators:**
```java
// GOOD - tests real behavior
@Test
void processOrderSendsNotification() {
    var database = new TestDatabase();
    var emailClient = new FakeEmailClient();  // Fake with real behavior
    var service = new OrderService(database, emailClient);
    
    service.process(orderId);
    
    assertThat(emailClient.wasNotified(customerEmail)).isTrue();
}
```

**Integration test through public API:**
```java
// GOOD - test actual workflow
@Test
void checkoutFlow() {
    var app = new Application(testConfig);
    
    var result = app.checkout(CreateOrderRequest.builder()
        .item("book")
        .quantity(2)
        .build());
    
    assertThat(result.status()).isEqualTo(OrderStatus.CONFIRMED);
    assertThat(result.confirmationNumber()).isNotNull();
}
```

**Narrow integration test with stub:**
```java
// GOOD - test one integration point
@Test
void fetchesWeatherFromApi() {
    var weatherStub = new WireMockServer();
    weatherStub.stubFor(get("/api/weather").willReturn(okJson(weatherResponse)));
    
    var client = new WeatherClient(weatherStub.baseUrl());
    var result = client.fetchWeather();
    
    assertThat(result.temperature()).isEqualTo(72);
}
```

## Test Structure

Use "Arrange, Act, Assert" (or Given/When/Then):
1. Set up test data and context
2. Invoke the method under test
3. Verify expected outcomes

## References

- Unit Test (sociable vs solitary): https://martinfowler.com/bliki/UnitTest.html
- Integration Test (narrow vs broad): https://martinfowler.com/bliki/IntegrationTest.html
- On Test Shapes: https://martinfowler.com/articles/2021-test-shapes.html
- Practical Test Pyramid: https://martinfowler.com/articles/practical-test-pyramid.html

---

SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
