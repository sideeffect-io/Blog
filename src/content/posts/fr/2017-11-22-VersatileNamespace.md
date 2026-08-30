---
title: Un namespace polyvalent
date: 2017-11-22
description: En Swift, certaines API comme RxSwift utilisent une technique qui confine le code qu’elles exposent dans un namespace dédié. Dans cet article, nous allons découvrir comment y parvenir de la manière la plus générique et polyvalente possible.
tags: astuces
image: images/2017-11-22-VersatileNamespace/space.jpg
lang: fr
---

En Swift, certaines API comme RxSwift utilisent une technique qui confine le code qu’elles exposent dans un namespace dédié. Dans cet article, nous allons découvrir comment y parvenir de la manière la plus générique et polyvalente possible.

```swift
let myButton = UIButton()
myButton.rx.tap.subscribe(…) // this is a RxCocoa kind of code
```

Vous êtes-vous déjà demandé comment il était possible d’écrire une telle ligne de code en Swift ?

C’est la partie **.rx.** qui paraît étrange au premier regard, n’est-ce pas ? Elle agit comme une sorte de namespace personnalisé.

* Est-ce une variable ?
* Est-ce une classe interne ?

Nous disposons de quelques indices :

* puisqu’il est accessible avec la notation pointée, il doit être membre de la classe UIButton ;
* il possède des propriétés comme **tap**, il s’agit donc d’une structure de données.

Avec ces deux indices, nous pouvons essayer de créer notre propre namespace.

# Étape 1 : l’approche naïve et peu utile

Dans les exemples suivants, nous allons essayer d’ajouter à UIButton un namespace personnalisé qui expose une seule fonction, **hello**.

Puisque le namespace doit être une structure de données, essayons avec une structure Swift :

```swift
struct ButtonNameSpace {
    func hello () {
        print ("Hello")
    }
}
```

Jusqu’ici, tout va bien. Comme le namespace doit être membre de UIButton, nous allons l’ajouter sous forme de propriété calculée :

```swift
extension UIButton {
    var nameSpace: ButtonNameSpace {
        return ButtonNameSpace()
    }
}
```

Nous pouvons maintenant l’utiliser ainsi :

```swift
let myButton = UIButton()
myButton.nameSpace.hello()
```

Le résultat de cet appel sera : « **Hello** ».

À quoi cela peut-il servir ? À rien de très intéressant, dirais-je, car nous ne pouvons pas accéder aux propriétés et aux fonctions de UIButton depuis le namespace. Nous ne pouvons agir que depuis l’extérieur de UIButton ; il serait bien d’ajouter un peu de **contexte** à notre namespace.

# Étape 2 : l’approche utile

Pour accéder aux propriétés et aux fonctions de UIButton, nous devons transmettre une référence vers ce bouton à la structure de données utilisée pour le namespace.

```swift
struct ButtonNameSpace {
    private let button: UIButton

    init(with button: UIButton) {
        self.button = button
    }

    func hello () {
        let title = self.button.title(for: .normal) ?? ""
        print ("Hello \(title)")
    }
}
```

La structure **ButtonNameSpace** conserve une référence vers le UIButton qui la crée.

Nous ajoutons toujours une propriété calculée à UIButton et, lorsque **ButtonNameSpace** est créé, nous lui transmettons une référence vers le bouton lui-même. Nous pouvons désormais accéder aux propriétés du bouton, comme son **title**.

```swift
extension UIButton {
    var nameSpace: ButtonNameSpace {
        return ButtonNameSpace(with: self)
    }
}
```

Nous pouvons toujours l’utiliser ainsi :

```swift
let myButton = UIButton()
myButton.setTitle("My button", for: .normal)
myButton.nameSpace.hello()
```

Le résultat de cet appel sera : « **Hello My Button** ». Le namespace prend ici beaucoup plus de sens, puisqu’il est lié à l’objet dans lequel il est créé.

Et si nous devions écrire un namespace pour UIImage, par exemple ? Avec l’approche actuelle, nous devrions également déclarer une structure **ImageNameSpace**.

En réalité, le véritable objectif d’une telle structure est de conserver une référence vers l’objet dans lequel elle est créée. Cela ressemble à un cas d’usage pour les génériques, non ?

# Étape 3 : la meilleure approche

La réponse est **OUI**. Cette structure **DOIT** être générique.

```swift
struct MyNameSpace<Base> {
    private let base: Base

    init(with base: Base) {
        self.base = base
    }
}
```

Comme nous pouvons le voir, l’unique objectif de cette structure est de conserver une référence vers **quelque chose** qui lui est transmis à l’initialisation, afin que nous puissions y accéder lors des appels suivants.

Nous pouvons maintenant utiliser quelque chose de vraiment pratique en Swift : les **extensions conditionnelles**. Elles permettent d’ajouter des fonctionnalités à cette structure uniquement si **Base** correspond au type recherché. Par exemple, si **Base** est un **UIButton**, nous ajoutons une fonction **hello** qui effectue la même chose que l’ancien **ButtonNameSpace** :

```swift
extension MyNameSpace where Base: UIButton {
    func hello () {
        let title = self.base.title(for: .normal) ?? ""
        print ("Hello \(title)")
    }
}
```

Au lieu d’accéder à **self.button.title**, nous pouvons accéder à **self.base.title**, puisque nous savons avec certitude que **base** est un UIButton. Nous pouvons ajouter une propriété calculée à UIButton tout en tenant compte du caractère générique du namespace.

```swift
extension UIButton {
    var myNameSpace: MyNameSpace<UIButton> {
        return MyNameSpace(with: self)
    }
}
```

L’utilisation et le résultat restent identiques.

```swift
let myButton = UIButton()
myButton.setTitle("My button", for: .normal)
myButton.myNameSpace.hello()
```

Revenons au cas de UIImage. Il n’est plus nécessaire de définir une structure de namespace dédiée : nous pouvons utiliser notre structure générique avec une nouvelle extension conditionnelle.

```swift
extension UIImage {
    var myNameSpace: MyNameSpace<UIImage> {
        return MyNameSpace(with: self)
    }
}

extension MyNameSpace where Base: UIImage {
    func hello () {
        let title = self.base.accessibilityHint ?? ""
        print ("Hello \(title)")
    }
}

let myImage = UIImage()
myImage.accessibilityHint = "My Image"
myImage.myNameSpace.hello()
```

En fait, c’est exactement ainsi que RxSwift a implémenté le namespace **rx**, comme nous pouvons le voir ici : [Reactive.swift](https://github.com/ReactiveX/RxSwift/blob/0b66f666ba6955a51cba1ad530311b030fa4db9c/RxSwift/Reactive.swift)

J’espère que cela vous sera utile.

À bientôt.
