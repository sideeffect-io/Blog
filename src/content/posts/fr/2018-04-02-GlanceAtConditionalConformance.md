---
title: Un aperçu de la conformité conditionnelle
date: 2018-04-02
description: Swift 4.1 est disponible depuis quelques jours et apporte une fonctionnalité intéressante, la conformité conditionnelle. C’est un nouvel outil au service de la programmation orientée protocoles et de la conception d’API. Cet article propose un premier aperçu de cette toute nouvelle technique.
tags: langage
image: images/2018-04-02-GlanceAtConditionalConformance/swift4.1.png
lang: fr
---

Swift 4.1 est disponible depuis quelques jours et apporte une fonctionnalité intéressante : la **conformité conditionnelle**. C’est un nouvel outil au service de la programmation orientée protocoles et de la conception d’API. Cet article propose un premier aperçu de cette toute nouvelle technique ; des articles plus approfondis suivront certainement dans quelques semaines.

# Tout est une question d’extensions

Avec Swift, les différentes manières d’implémenter des extensions peuvent prêter à confusion. À mesure que le langage mûrit, de nouvelles possibilités apparaissent et les développeurs doivent choisir la bonne 🤨.

## Les extensions simples

Une extension permet d’enrichir le comportement d’un type sans avoir à en hériter :

```swift
extension String {
    public func numberOf (letter: Character) -> Int {
        return self.filter { $0 == letter }.count
    }

    static func build (withNumberOfSpaces spaces: Int) -> String {
        return [Int](1...spaces).reduce("", { (previous, _) -> String in
            return previous + " "
        })
    }
}

let blog = "twittemb.github.io"
let emptySpaces = String.build(withNumberOfSpaces: 10)

print ("Number of t in \(blog): \(blog.numberOf(letter: "t"))"")
/// will print: Number of t in twittemb.github.io: 4

print ("String from factory: |\(emptySpaces)|")
/// will print: String from factory: |          |
```

Elles sont utiles pour créer des fonctions utilitaires ou implémenter efficacement un pattern Factory.

## Les extensions conditionnelles

Il existe un raffinement des extensions simples, dédié aux types génériques :

```swift
extension Array where Element: Numeric {
    func sum () -> Element {
        return self.reduce (0, +)
    }
}

let numerics = [1, 2, 3, 4, 5.5]
print ("Sum of elements in \(numerics): \(numerics.sum())")

/// will print: Sum of elements in [1.0, 2.0, 3.0, 4.0, 5.5]: 15.5
```

Appliquer une fonction sum() à un Array de Bool n’aurait probablement aucun sens. Ce type d’extension permet d’ajouter de nouvelles fonctionnalités à un type existant tout en garantissant leur sûreté d’utilisation. C’est particulièrement utile lorsque vous concevez une API destinée à d’autres développeurs : ils bénéficient gratuitement de certaines fonctionnalités si, et seulement si, ils satisfont aux bonnes exigences.

## Les extensions de conformité

Les extensions peuvent non seulement ajouter des comportements à des types existants, mais aussi modifier un type pour le rendre conforme à un protocole.

```swift
protocol Resettable {
    func reset () -> Self
}

extension String: Resettable {
    func reset() -> String {
        return ""
    }
}

extension Int: Resettable {
    func reset() -> Int {
        return 0
    }
}

extension Optional: Resettable {
    func reset() -> Optional<Wrapped> {
        return nil
    }
}

let name = "Spock"
let age = 120
let isVulcan: Bool? = true

let resettables: [Resettable] = ["Spock", 120 , isVulcan]
print ("Array before reset: \(resettables)")
/// will print: Array before reset: ["Spock", 120, Optional(true)]

let reset = resettables.map { $0.reset() }
print ("Array after reset: \(reset)")
/// will print: Array after reset: ["", 0, nil]
```

Cela apporte de l’uniformité là où régnait l’hétérogénéité. Il aurait été impossible de mélanger des **String**, des **Int** et des **Optional** dans un même **Array** sans les faire conformer au même protocole.

Cependant, même si chaque élément du tableau est **Resettable**, nous devons encore le parcourir avec **map** et appeler **reset()** sur chacun pour obtenir une opération globale.

La conformité conditionnelle permettra au développeur qui souhaite réinitialiser tout le tableau de réaliser cette opération de manière transparente.

## Les extensions de protocole

Nous n’avons pas encore parlé de programmation orientée protocoles. Ce paradigme permet d’ajouter un comportement par défaut à un protocole. Les types qui s’y conforment bénéficient eux aussi de ce comportement — ou peuvent le remplacer. Il s’agit d’un type d’extension particulier, qui n’est pas vraiment le sujet de cet article. N’ajoutons donc pas trop de bruit et concentrons-nous sur la possibilité d’étendre un type concret.

# Se conformer uniquement si…

La **conformité conditionnelle** est la toute nouvelle fonctionnalité introduite avec Swift 4.1. Elle mélange **extension conditionnelle** et **extension de conformité**, et hérite donc de leurs principes clés :

* apporter de nouvelles fonctionnalités tout en garantissant leur sûreté d’utilisation ;
* apporter de l’uniformité là où régnait l’hétérogénéité.

L’une des principales idées est la suivante : si un comportement peut être appliqué à chaque élément d’un ensemble, nous pouvons considérer qu’il peut également être appliqué à l’ensemble lui-même.

```swift
extension Array: Resettable where Element == Resettable {
    func reset() -> Array<Element> {
        return self.map { $0.reset() }
    }
}

let innerResettableArray: [Resettable] = ["Spock", 120]
let resettableArray: [Resettable] = ["Kirk",
                                      45,
                                      Optional<Bool>(true),
                                      innerResettableArray]

print ("Array before reset: \(resettableArray)")
/// will print: Array before reset: ["Kirk", 45, Optional(true), ["Spock", 120]]

print ("Array after reset: \(resettableArray.reset())")
/// will print: Array after reset: ["", 0, nil, ["", 0]]
```

Puisque chaque élément du tableau est **Resettable**, le tableau entier l’est également. C’est exactement ce qu’Apple a fait avec Equatable et Hashable, par exemple. Avec Swift 4.1, un Array dont les éléments sont Equatable est lui-même Equatable.

Ce qui est formidable et très puissant dans notre exemple, c’est que nous pouvons imbriquer un Array de Resettable dans le tableau racine et, avec une seule instruction — **resettableArray.reset()** —, réinitialiser toute la structure de données. C’est une manière très élégante de traiter la **récursivité**.

Du point de vue de la conception d’API, la **conformité conditionnelle** présente donc un véritable avantage par rapport à une simple **extension de conformité**. Le concepteur de l’API intègre dans son framework le code — ici la fonction **reset()** — qu’il juge pertinent d’offrir gratuitement aux développeurs qui satisfont aux exigences appropriées.

## Exploiter la conformité conditionnelle pour faciliter l’implémentation de design patterns

Certains design patterns peuvent tirer parti de la possibilité offerte par la conformité conditionnelle d’appliquer un comportement à un type « conteneur ». Là encore, nous adoptons principalement le point de vue d’un concepteur d’API.

**Visitor** est un design pattern assez simple qui permet d’externaliser le parcours d’une structure de données. Pour une explication détaillée, consultez [Visitor Pattern](https://en.wikipedia.org/wiki/Visitor_pattern).

Nous allons ici implémenter des structures de données **Person** et **Car** qui sont **Visitable**. Grâce à la conformité conditionnelle, les **conteneurs** de **Visitable** seront eux aussi **Visitable** :

```swift
protocol Visitor {
    func visit (visitable: Visitable)
}

protocol Visitable {
    func accept (visitor: Visitor)
}

/// a Person can be visited
struct Person {
    let name: String
    let age: Int
}

extension Person: Visitable {
    func accept (visitor: Visitor) {
        if self.age > 30 {
            visitor.visit(visitable: self)
        }
    }
}

/// a Car can be visited
struct Car {
    let isElectric: Bool
    let model: String
    let price: Double
}

extension Car: Visitable {
    func accept (visitor: Visitor) {
        if self.isElectric {
            visitor.visit(visitable: self)
        }
    }
}

/// an Array of Visitables is also Visitable
extension Array: Visitable where Element == Visitable {
    func accept (visitor: Visitor) {
        self.forEach { $0.accept(visitor: visitor) }
    }
}

/// an Dictionary of Visitables is also Visitable
extension Dictionary: Visitable where Value == Visitable {
    func accept (visitor: Visitor) {
        self.values.forEach { $0.accept(visitor: visitor) }
    }
}

class AnyVisitor: Visitor {
    func visit (visitable: Visitable) {
        switch visitable {
        case let person as Person:
            print ("\(person.name) is \(person.age) years old")
        case let car as Car:
            print ("\(car.model)'s price is \(car.price)$")
        default:
            print (visitable)
        }
    }
}

let ironman = Person(name: "Tony Stark", age: 45)
let hulk = Person(name: "Bruce Banner", age: 40)
let captain = Person(name: "Steve Rogers", age: 29)
let spiderman = Person(name: "Peter Parker", age: 16)

let tesla = Car(isElectric: true, model: "Roadster", price: 120000)
let porsche = Car(isElectric: false, model: "911", price: 250000)
let ferrari = Car(isElectric: false, model: "GTO", price: 1000000)
let nissan = Car(isElectric: true, model: "Leaf", price: 30000)

let arrayToVisit: [Visitable] = [ironman, spiderman, tesla, porsche]
let dictionnaryToVisit: [String: Visitable] = [ "key1": hulk,
                                                "key2": captain,
                                                "key3": ferrari,
                                                "key4": nissan,
                                                "key5": arrayToVisit]

let anyVisitor = AnyVisitor()
dictionnaryToVisit.accept(visitor: anyVisitor)

/// will print:
/// Leaf's price is 30000.0$
/// Tony Stark is 45 years old
/// Roadster's price is 120000.0$
/// Bruce Banner is 40 years old
```

Pour visiter un ensemble de **Visitable**, il suffit de les ajouter à un conteneur comme un **Array** ou un **Dictionary**, puis de visiter ce dernier. Du point de vue du développeur, seul **AnyVisitor** doit être implémenté.

## Attention à l’autocomplétion

L’utilisation de la **conformité conditionnelle** présente un petit inconvénient dans Xcode. Si nous revenons à notre exemple **Resettable**, Bool ne l’est pas. Pourtant, lorsque nous déclarons un **Array&lt;Bool&gt;**, Xcode propose la fonction **reset()** dans l’autocomplétion.

Le compilateur vous informera bien sûr ensuite que Bool n’est pas Resettable… mais Xcode aurait peut-être pu être un peu plus restrictif !

Ce n’est pas très grave 😊, mais je devais le signaler.

J’espère que ce premier aperçu de la conformité conditionnelle vous a plu. De nouveaux usages apparaîtront certainement dans les semaines à venir.

À bientôt.
