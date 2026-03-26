---
name: general-programming
description: General programming principles and best practices that apply across all languages and tasks. Use for all coding tasks to ensure consistent quality and robustness. Consumed after session-init.
# SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing
#
# SPDX-License-Identifier: CC-BY-NC-SA-4.0
---

# General Programming Principles

These principles apply to all programming tasks regardless of language or framework.

## Rule 1: Never Ignore Errors

**This is the most important rule.** Errors must never be silently ignored. Always handle errors explicitly by either:

1. **Rethrowing** - Let the error propagate up the call stack if it cannot be handled at the current level
2. **Logging** - Log the error with sufficient context before continuing or aborting

### Anti-patterns (Never Do This)

**Empty catch blocks:**
```java
// BAD - exception is silently lost
try {
    riskyOperation();
} catch (Exception e) {
    // ignored
}
```

### Correct Approaches

**Rethrow when you cannot handle it:**
```java
// GOOD - rethrow to let caller handle
try {
    riskyOperation();
} catch (IOException e) {
    throw new ApplicationException("Failed to process file", e);
}
```

**Log when you need to continue:**
```java
// GOOD - log with context before continuing
try {
    optionalCleanup();
} catch (Exception e) {
    log.warn("Cleanup failed for resource {}, continuing anyway", resourceId, e);
}
```

### Error Handling Decision Tree

1. **Can you recover from this error?**
   - Yes → Handle it and continue
   - No → Go to step 2

2. **Should the caller know about this error?**
   - Yes → Rethrow (possibly wrapped with more context)
   - No → Go to step 3

3. **Is this an optional/non-critical operation?**
   - Yes → Log at appropriate level and continue
   - No → Log and terminate/rethrow

## Rule 2: Always Run Tests

Before considering any task complete, run the relevant tests. See the `testing` skill for detailed guidance on test philosophy and patterns.

**Key principles:**
- Prefer **sociable tests** (real collaborators) over **solitary tests** (mocks)
- Prefer **narrow integration tests** (test one integration point) over broad end-to-end tests
- Test observable behavior through public APIs, not implementation details
- Use stubs/fakes for external services; avoid mocks unless necessary

**Coverage targets:**
- Maintain high coverage (90%+)
- Trivial code (getters/setters) should be exercised by other tests, not explicitly tested
- If trivial code isn't covered, question whether it's needed (libraries may be an exception)

## Rule 3: Prefer Immutability

Prefer immutable objects and data structures where immutability doesn't reduce comprehension.

**Benefits:**
- Thread safety without synchronization
- Predictable behavior - no surprise state changes
- Easier to reason about code
- Fewer defensive copies needed

**Examples:**
```java
// GOOD - immutable record
public record Person(String name, int age) {}

// GOOD - immutable collections
var items = List.of("a", "b", "c");  // Cannot be modified

// GOOD - builder pattern for complex immutables
var config = Config.builder()
    .timeout(Duration.ofSeconds(30))
    .retries(3)
    .build();
```

**Avoid setters** - Instead of anemic data objects with getters/setters, prefer domain-driven design with rich behavior:
```java
// BAD - anemic object with setter
person.setStatus("APPROVED");

// GOOD - tell, don't ask
person.approve();
```

**When mutability is acceptable:**
- Performance-critical code where immutability causes measurable overhead
- Accumulators/builders during object construction
- Cases where it significantly reduces comprehension

## Rule 4: SOLID Design and Polymorphic Behavior

Design code that follows SOLID principles with a focus on polymorphic behavior:

### Single Responsibility
- Each unit (class, function, module) has one reason to change
- Let your domain language define responsibilities
- Build units around single responsibilities derived from the domain

### Open/Closed Principle
- Open for extension, closed for modification
- Use polymorphism to add behavior without changing existing code

### Liskov Substitution
- Subtypes must be substitutable for their base types
- Polymorphic behavior should be predictable

### Interface Segregation
- Prefer small, focused interfaces over large, general ones
- Clients shouldn't depend on methods they don't use

### Dependency Inversion
- Depend on abstractions, not concrete implementations
- This enables the polymorphic behavior that makes systems flexible

### Polymorphic Behavior is Key

**Encapsulate behavior so it's polymorphic** - let the unit decide how to act rather than orchestrating externally.

**Polymorphism takes many forms:**
- Traditional inheritance and interfaces
- Lambdas and functional programming (passing behavior as data)
- Strategy patterns and dependency injection

```java
// BAD - external orchestration with conditionals
public void processPayment(PaymentType type, Amount amount) {
    if (type == PaymentType.CREDIT_CARD) {
        processCreditCard(amount);
    } else if (type == PaymentType.PAYPAL) {
        processPayPal(amount);
    } else if (type == PaymentType.BANK_TRANSFER) {
        processBankTransfer(amount);
    }
}
```

```java
// GOOD - polymorphic behavior, each type decides how to act
public interface PaymentMethod {
    void pay(Amount amount);
}

public class CreditCardPayment implements PaymentMethod {
    @Override
    public void pay(Amount amount) {
        // Credit card specific implementation
    }
}

// Usage - no conditionals, behavior is encapsulated
public void processPayment(PaymentMethod method, Amount amount) {
    method.pay(amount);  // Polymorphic dispatch
}
```

If you follow these principles, your code will naturally be composable, clear, and aligned with the domain.

## Rule 5: Do Not Assume Synchronized State

**Your local repository state may be stale.** The operator may merge PRs, change branches, or modify files outside your session. Never assume:

### Git/Repository Assumptions (Dangerous)

**Do not assume:**
- Your local `develop` (or default branch) is current with `origin`
- Files haven't changed since you last read them
- Branches you created are still valid (PRs may have been merged/closed)
- Your working directory is clean or as you left it

### Workspace Assumptions (Dangerous)

**Do not assume exclusive access to:**
- The filesystem (other processes/agents may modify files)
- Environment variables (may change between invocations)
- Network ports (may be in use by other services)
- Running processes (state may not be what you expect)

### Correct Approaches

**Verify git state at session start:**
```bash
# Always check if local HEAD is behind origin
git fetch origin
git status

# Pull latest before starting work
git pull origin develop
```

**Don't assume file state persists:**
```java
// BAD - assumes file hasn't changed since last read
private Config cachedConfig;  // May be stale

// GOOD - read fresh when needed
public Config getConfig() {
    return ConfigLoader.load("config.json");  // Always current
}
```

**Explicitly verify external state:**
```bash
# Check if port is available before using
if ! lsof -i :8080 > /dev/null 2>&1; then
    start_server_on_port 8080
else
    echo "Port 8080 is already in use"
fi
```

**When uncertain, verify** rather than assuming state is as you left it.

---

SPDX-FileCopyrightText: Copyright © 2026 Caleb Cushing

SPDX-License-Identifier: CC-BY-NC-SA-4.0
