---
title: Des erreurs Equatable en Swift
date: 2021-12-10
description: Error est un type de base en Swift qui représente un problème survenu dans le flux de l’application. Cet article explore une manière de rendre une erreur conforme à Equatable sans compromettre son abstraction.
tags: langage
image: images/2021-12-10-EquatableError/header.jpg
lang: fr
---

# Des erreurs Equatable en Swift

# Introduction

`Error` est un protocole simple à utiliser en Swift. Comme il peut être utilisé en tant que [type existentiel](https://docs.swift.org/swift-book/LanguageGuide/Protocols.html#ID275), vous pouvez déclarer une valeur de type `Error` et la faire circuler :

```swift
func printError(_ error: Error) {
    print(error)
}

struct NetworkError: Error {}
struct DatabaseError: Error {}

let error: Error = NetworkError()
printError(error) // prints "NetworkError()"
```

En utilisant `Error` comme type existentiel, nous évitons de divulguer les détails d’implémentation. Nous pouvons passer la variable `error` à la fonction `printError` sous la forme du protocole `Error`. La fonction n’a pas besoin de connaître le type concret sous-jacent de l’`Error`. Le code devient plus découplé et polyvalent puisqu’il peut être utilisé avec n’importe quelle erreur concrète conforme au protocole. C’est, au fond, tout l’intérêt de l’abstraction.

Nous avons parfois besoin que les erreurs soient `Equatable`. Malheureusement, `Equatable` ne peut pas être utilisé comme type existentiel. Le code suivant ne compile pas :

```swift
func printError(_ error: Error & Equatable) {
    print(error)
}
```

De la même manière, lorsque nous voulons définir un type de données `Equatable` qui embarque une `Error`, la conformité à `Equatable` est rompue à cause du type `Error` :

```swift
enum State: Equatable {
    case loading
    case loaded
    case failed(Error) // Error does not conform to Equatable
}
```

Nous pouvons essayer d’imposer la conformité à `Equatable` pour l’erreur embarquée, mais, pour la raison évoquée plus haut, ce code ne compile pas non plus :

```swift
enum State: Equatable {
    case loading
    case loaded
    case failed(Error & Equatable)
}
```

Une manière de le faire fonctionner consiste à définir notre propre type d’erreur `Equatable` :

```swift
struct NetworkError: Error, Equatable {}
struct DatabaseError: Error, Equatable {}

enum StateError: Error, Equatable {
    case network(NetworkError)
    case database(DatabaseError)
}

enum State: Equatable {
    case loading
    case loaded
    case failed(StateError)
}
```

Mais cela a un prix : nous divulguons les détails d’implémentation. Nous ne devrions pas avoir besoin de connaître le type de l’erreur, et encore moins la technologie qui se cache derrière. Les informations `network` ou `database` sont réservées à la couche d’injection de dépendances, pas à la couche métier. Nous voulons que l’erreur ne soit que cela… une `Error`.

Une autre manière de contourner ce problème serait d’utiliser des génériques contraints :

```swift
enum State<ErrorType: Error & Equatable>: Equatable {
    case loading
    case loaded
    case failed(ErrorType)
}
```

Cela ne semble pas être une solution satisfaisante ni simple :

- nous divulguons toujours les détails d’implémentation : `let state = State<StateError>.loading` ;
- nous devons préciser le type d’erreur même si l’état n’est pas `failed` : `let state: State = .loaded` ne compile pas, car `ErrorType` est absent.

Avant de chercher une autre solution à ce problème, je pense qu’il est important de comprendre pourquoi l’utilisation d’`Equatable` peut être délicate.

## Le protocole Equatable

D’après la bibliothèque standard de Swift :

> Les types conformes au protocole `Equatable` peuvent être comparés à l’aide de l’opérateur d’égalité (`==`) ou de l’opérateur d’inégalité (`!=`).

De nombreux types Swift sont conformes à `Equatable`.

```swift
let a: Int = 2
let b: Int = 3
let c: Int = 2

a == b // false
a == c // true
```

```swift
let a: String = "2"
let b: String = "3"
let c: String = "2"

a == b // false
a == c // true
```

Bien qu’`Int` et `String` soient tous deux conformes à `Equatable`, cela ne signifie pas qu’ils peuvent être comparés entre eux.

```swift
let a: Int = 2
let b: String = "3"

a == b

// error: binary operator '==' cannot be applied to operands of type 'Int' and 'String'
// overloads for '==' exist with these partially matching parameter lists: (Int, Int), (String, String)
```

L’erreur semble logique : dans la vraie vie non plus, nous ne pouvons pas comparer des entiers et des chaînes de caractères. Mais qu’est-ce qui nous empêche réellement de le faire en Swift ? La réponse se trouve dans la définition du protocole :

```swift
public protocol Equatable {
    /// Returns a Boolean value indicating whether two values are equal.
    /// - Parameters:
    ///   - lhs: A value to compare.
    ///   - rhs: Another value to compare.
    static func == (lhs: Self, rhs: Self) -> Bool
}
```

La fonction `==` attend deux paramètres du même type, c’est-à-dire `Self`, le type conforme à `Equatable`. Évidemment, `Int` et `String` ne sont pas du même type. Cela explique pourquoi nous ne pouvons pas les comparer.

Une autre caractéristique du protocole `Equatable` est qu’il ne peut pas être utilisé comme [type existentiel](https://docs.swift.org/swift-book/LanguageGuide/Protocols.html#ID275).

Si vous essayez d’utiliser le protocole `Equatable` comme type existentiel :

```swift
let value: Equatable = "1"
```

Vous obtiendrez cette erreur :

> protocol 'Equatable' can only be used as a generic constraint because it has Self or associated type requirements

Dans la définition du protocole, `Self` sert à identifier précisément le type à comparer afin que le test d’égalité puisse être effectué. En masquant le type concret de la variable au profit d’`Equatable`, le compilateur utiliserait cette signature pour vérifier l’égalité :

```swift
static func == (lhs: Equatable, rhs: Equatable) -> Bool {}
```

`Equatable` ne contient pas assez d’informations pour réaliser une telle comparaison.

C’est également ce qui nous empêche d’utiliser `Equatable` dans des tableaux :

```swift
let array: [Equatable] = [1, 2, 3, 4, 5]
```

Le compilateur ne dispose pas de suffisamment d’informations sur chaque élément. Il lui serait impossible d’effectuer une comparaison d’égalité sur l’ensemble.

## EquatableError

Revenons à notre problème :

- nous voulons utiliser `Error` sans divulguer les détails d’implémentation ;
- nous voulons embarquer `Error` dans un type de données `Equatable` sans rompre la conformité à `Equatable`.

Très bien, l’implémentation de base pourrait être :

```swift
struct EquatableError: Error, Equatable {
    let base: Error
}
```

Évidemment, cela ne compile pas puisque `base` n’est pas `Equatable`… c’est le serpent qui se mord la queue !

Satisfaisons le compilateur et ajoutons une fonction `==` :

```swift
struct EquatableError: Error, Equatable {
    let base: Error

    static func ==(lhs: EquatableError, rhs: EquatableError) -> Bool {
        return type(of: lhs.base) == type(of: rhs.base) &&
        lhs.base.localizedDescription == rhs.base.localizedDescription
    }
}
```

Nous vérifions que les deux erreurs `base` ont le même type et que leur seule propriété est égale, mais ce mécanisme peut facilement être trompé :

```swift
struct NetworkError: LocalizedError, Equatable {
    let code: Int
    var errorDescription: String? { "Foo" }
}

let errorA = EquatableError(base: NetworkError(code: 1))
let errorB = EquatableError(base: NetworkError(code: 2))

errorA == errorB // will output `true`
```

Nous nous attendrions à ce qu’`errorA` et `errorB` ne soient **PAS** égales à cause de leurs propriétés `code` différentes. Malheureusement, seule la `localizedDescription` est prise en compte dans la vérification d’égalité.

Nous devrions nous appuyer sur la fonction `==` de l’erreur `base` :

```swift
struct EquatableError: Error, Equatable {
    let base: Error
    private let equals: (Error) -> Bool

    init<Base: Error & Equatable>(_ base: Base) {
        self.base = base
        self.equals = { ($0 as? Base) == base }
    }

    static func ==(lhs: EquatableError, rhs: EquatableError) -> Bool {
        lhs.equals(rhs.base)
    }
}
```

Essayons :

```swift
enum Reason: Equatable {
    case badNetwcork
    case noNetwork
}

struct NetworkError: Error, Equatable {
    let code: Int
    let reason: Reason
    let isRecoverable: Bool

    static func ==(lhs: NetworkError, rhs: NetworkError) -> Bool {
        lhs.code == rhs.code && lhs.reason == rhs.reason
    }
}

let networkErrorA = NetworkError(code: 1701, reason: .badNetwcork, isRecoverable: false)
let networkErrorB = NetworkError(code: 1701, reason: .badNetwcork, isRecoverable: true)
let networkErrorC = NetworkError(code: 1702, reason: .noNetwork, isRecoverable: false)

networkErrorA == networkErrorB // prints true 👍
networkErrorA == networkErrorC // prints false 👍

let equatableErrorA = EquatableError(networkErrorA)
let equatableErrorB = EquatableError(networkErrorB)
let equatableErrorC = EquatableError(networkErrorC)

equatableErrorA == equatableErrorB // prints true 👍
equatableErrorA == equatableErrorC // prints false 👍

```

Le seul inconvénient de cette implémentation est la contrainte `Equatable` sur le type `Base`. Et si nous voulions pouvoir transformer n’importe quelle `Error` en `EquatableError` ?

Eh bien, il existe une solution acceptable :

```swift
struct EquatableError: Error, Equatable {
    let base: Error
    private let equals: (Error) -> Bool

    init<Base: Error>(_ base: Base) {
        self.base = base
        self.equals = { String(reflecting: $0) == String(reflecting: base) }
    }

    init<Base: Error & Equatable>(_ base: Base) {
        self.base = base
        self.equals = { ($0 as? Base) == base }
    }

    static func == (lhs: EquatableError, rhs: EquatableError) -> Bool {
        lhs.equals(rhs.base)
    }
}
```

Si l’erreur `base` n’est pas `Equatable`, nous pouvons utiliser la réflexion pour inspecter sa structure interne et nous en servir comme point de comparaison. Swift nous fournit pour cela un initialiseur de `String` bien pratique :

```swift
let networkError = NetworkError(code: 1701, reason: .badNetwcork, isRecoverable: false)
let description = String(reflecting: networkError)

print(description) // will print NetworkError(code: 1701, reason: Reason.badNetwcork, isRecoverable: false)
```

Utiliser `String(reflecting:)` est une solution de repli acceptable, mais pas fiable à 100 %, car nous pouvons toujours rendre le type conforme à `CustomDebugStringConvertible`, `CustomStringConvertible` ou `TextOutputStreamable` et influencer la chaîne produite.

Au bout du compte, notre modèle peut embarquer l’`EquatableError` tout en restant `Equatable`, sans divulguer les détails d’implémentation.

```swift
enum State: Equatable {
    case loading
    case loaded
    case failed(EquatableError)
}
```

Nous pouvons toujours récupérer l’`Error` concrète sous-jacente :

```swift
if case let State.failed(error) = state,
        let networkError = error.base as? NetworkError {
    ....
}
```

## Bonus

Nous pouvons ajouter quelques utilitaires bien pratiques à notre code.

Commençons par rendre `EquatableError` conforme à `CustomStringConvertible` et déléguons la description à son erreur de base.

```swift
struct EquatableError: Error, Equatable, CustomStringConvertible {
    ...
    var description: String {
        "\(self.base)"
    }
}
```

Nous pouvons ainsi afficher l’`EquatableError` comme s’il s’agissait de sa base.

```swift
let networkError = NetworkError(code: 1701, reason: .badNetwcork, isRecoverable: false)
let equatableError = EquatableError(networkError)

print(equatableError) // prints NetworkError(code: 1701, reason: Reason.badNetwcork, isRecoverable: false)
```

De la même façon, nous pouvons déléguer la `localizedDescription` à l’erreur de base :

```swift
struct EquatableError: Error, Equatable, CustomStringConvertible {
    ...
    var localizedDescription: String {
        self.base.localizedDescription
    }
}
```

Facilitons également la création d’une `EquatableError` à partir de n’importe quelle erreur :

```swift
extension Error where Self: Equatable {
    func toEquatableError() -> EquatableError {
        EquatableError(self)
    }
}

extension Error {
    func toEquatableError() -> EquatableError {
        EquatableError(self)
    }
}

let equatableError = NetworkError(
    code: 1701,
    reason: .badNetwcork,
    isRecoverable: false
).toEquatableError()
```

Enfin, nous pouvons fournir une fonction utilitaire pour extraire l’erreur de base sous la forme d’une `Error` concrète :

```swift
struct EquatableError: Error, Equatable, CustomStringConvertible {
    ...
    func asError<Base: Error>(type: Base.Type) -> Base? {
        self.base as? Base
    }
}

if let networkError = equatableError.asError(type: NetworkError.self) {
    ...
}
```

Voici l’implémentation complète d’`EquatableError` :

```swift
struct EquatableError: Error, Equatable, CustomStringConvertible {
    let base: Error
    private let equals: (Error) -> Bool

    init<Base: Error>(_ base: Base) {
        self.base = base
        self.equals = { String(reflecting: $0) == String(reflecting: base) }
    }

    init<Base: Error & Equatable>(_ base: Base) {
        self.base = base
        self.equals = { ($0 as? Base) == base }
    }

    static func ==(lhs: EquatableError, rhs: EquatableError) -> Bool {
        lhs.equals(rhs.base)
    }

    var description: String {
        "\(self.base)"
    }

    func asError<Base: Error>(type: Base.Type) -> Base? {
        self.base as? Base
    }

    var localizedDescription: String {
        self.base.localizedDescription
    }
}

extension Error where Self: Equatable {
    func toEquatableError() -> EquatableError {
        EquatableError(self)
    }
}

extension Error {
    func toEquatableError() -> EquatableError {
        EquatableError(self)
    }
}
```

J’espère que cela vous aidera. Merci de m’avoir lu.

Un grand merci à Ryan F. et Ryan G. pour leurs relectures.
